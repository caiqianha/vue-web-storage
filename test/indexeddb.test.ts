import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { effectScope } from 'vue';
import {
  createIndexedDBStorage,
  IndexedDBStorage,
  hasIndexedDB,
  indexedDBChannelName,
  __resetIndexedDBWarning
} from '../src/indexeddb';
import { useIndexedDB } from '../src/composables';
import { StorageValidationError } from '../src/schema';
import type { StandardSchemaV1 } from '../src/types';

const PREFIX = 'idb-';
const DB = 'test-db';

beforeEach(() => {
  // 每个用例一个全新的 IndexedDB 工厂，互不干扰
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __resetIndexedDBWarning();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const make = (options: Parameters<typeof createIndexedDBStorage>[0] = {}) =>
  createIndexedDBStorage({ dbName: DB, prefix: PREFIX, ...options });

/** 直接读取原生库里存的原始字符串 */
function rawGet(fullKey: string, dbName = DB, storeName = 'keyval'): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        resolve(undefined);
        return;
      }
      const r = db.transaction(storeName, 'readonly').objectStore(storeName).get(fullKey);
      r.onsuccess = () => {
        db.close();
        resolve(r.result);
      };
      r.onerror = () => reject(r.error);
    };
  });
}

/** 轮询等待条件成立（按次数而不是时间，兼容假 Date） */
async function waitFor(predicate: () => boolean, attempts = 400): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('waitFor: condition not met');
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const positive: StandardSchemaV1<unknown, number> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: value =>
      typeof value === 'number' && value > 0 ? { value } : { issues: [{ message: 'expected a positive number' }] }
  }
};

describe('IndexedDBStorage: CRUD', () => {
  it('stores and retrieves typed values using the same envelope as WebStorage', async () => {
    const s = make();
    expect(s).toBeInstanceOf(IndexedDBStorage);
    expect(await s.set('num', 42)).toBe(true);
    expect(await s.set('obj', { a: [1, 2], b: 'x' })).toBe(true);
    expect(await s.get<number>('num')).toBe(42);
    expect(await s.get('obj')).toEqual({ a: [1, 2], b: 'x' });
    expect(await s.has('num')).toBe(true);
    expect(await s.has('missing')).toBe(false);
    expect(await s.get('missing')).toBeNull();
    expect(await s.get('missing', { defaultValue: 'd' })).toBe('d');

    const raw = await rawGet(PREFIX + 'num');
    expect(typeof raw).toBe('string');
    const parsed = JSON.parse(raw as string);
    expect(parsed).toMatchObject({ value: 42, expires: null });
    expect(Object.keys(parsed)).toEqual(['value', 'expires', 'created']);
  });

  it('remove / clear / keys / getAll only touch the prefixed keys', async () => {
    const s = make();
    const other = createIndexedDBStorage({ dbName: DB, prefix: 'other-' });
    await other.set('k', 'foreign');
    await s.set('a', 1);
    await s.set('b', { x: 1 });
    expect(await s.remove('a')).toBe(true);
    expect(await s.has('a')).toBe(false);
    expect(await s.keys()).toEqual(['b']);
    expect(await s.getAll()).toEqual({ b: { x: 1 } });
    expect(await s.clear()).toBe(true);
    expect(await s.keys()).toEqual([]);
    expect(await other.get('k')).toBe('foreign');
  });

  it('adds its object store to an existing database with another store', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('shared-db', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('existing');
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    const s = createIndexedDBStorage({ dbName: 'shared-db', storeName: 'mine', prefix: PREFIX });
    expect(await s.set('k', 1)).toBe(true);
    expect(await s.get('k')).toBe(1);
    expect(await rawGet(PREFIX + 'k', 'shared-db', 'mine')).toBeTypeOf('string');
    s.close();
  });

  it('emits events and rejects invalid TTL values', async () => {
    const s = make();
    const events: string[] = [];
    (['set', 'get', 'remove', 'clear'] as const).forEach(t => s.on(t, e => events.push(e.type)));
    await s.set('a', 1);
    await s.get('a');
    await s.remove('a');
    await s.clear();
    expect(events).toEqual(['set', 'get', 'remove', 'clear']);

    await expect(s.set('k', 1, { expires: -1 })).rejects.toThrow(TypeError);
    expect(() => createIndexedDBStorage({ expires: NaN })).toThrow(TypeError);
    expect(() => createIndexedDBStorage({ version: 1.5 })).toThrow(TypeError);
  });
});

describe('IndexedDBStorage: TTL', () => {
  it('expires items and removes them on read', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const s = make();
    const expired = vi.fn();
    s.on('expired', expired);
    await s.set('tok', 'abc', { expires: 1000 });
    vi.advanceTimersByTime(999);
    expect(await s.get('tok')).toBe('abc');
    vi.advanceTimersByTime(2);
    expect(await s.get('tok')).toBeNull();
    expect(await rawGet(PREFIX + 'tok')).toBeUndefined();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('applies the default `expires`, lets 0 override it, and clearExpired sweeps', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const s = make({ expires: 500 });
    await s.set('short', 1);
    await s.set('forever', 2, { expires: 0 });
    vi.advanceTimersByTime(501);
    expect(await s.clearExpired()).toBe(1);
    expect(await s.keys()).toEqual(['forever']);
    expect(await s.has('short')).toBe(false);
    expect(await s.has('forever')).toBe(true);
  });
});

describe('IndexedDBStorage: obfuscation', () => {
  it('instance-level encrypt round-trips UTF-8 content and marks the envelope', async () => {
    const s = make({ encrypt: true, encryptKey: 'secret' });
    const value = { msg: '中文😀', list: ['é'] };
    expect(await s.set('k', value)).toBe(true);
    const raw = (await rawGet(PREFIX + 'k')) as string;
    expect(raw).not.toContain('中文');
    expect(JSON.parse(raw)).toMatchObject({ vws: 1, encrypted: true });
    expect(await s.get('k')).toEqual(value);
    expect(await s.has('k')).toBe(true);
    expect(await s.keys()).toEqual(['k']);
  });

  it('per-item encrypt is readable by a non-encrypting instance', async () => {
    const s = make();
    await s.set('secret', '中文😀', { encrypt: true });
    await s.set('plain', 'visible');
    expect((await rawGet(PREFIX + 'secret')) as string).not.toContain('中文');
    expect((await rawGet(PREFIX + 'plain')) as string).toContain('visible');
    expect(await make().getAll()).toEqual({ secret: '中文😀', plain: 'visible' });
  });
});

describe('IndexedDBStorage: schema and migrations', () => {
  it('rejects invalid writes and falls back on invalid reads', async () => {
    const onInvalid = vi.fn();
    const s = make({ schema: positive, onInvalid });
    await expect(s.set('n', -1)).rejects.toBeInstanceOf(StorageValidationError);
    expect(await rawGet(PREFIX + 'n')).toBeUndefined();
    expect(await s.set('n', 5)).toBe(true);

    await make().set('bad', 'oops');
    expect(await s.get('bad', { defaultValue: 1 })).toBe(1);
    expect(onInvalid).toHaveBeenCalledWith('bad', expect.any(StorageValidationError));
    expect(await s.has('bad')).toBe(false);
    expect(await s.keys()).toEqual(['n']);
  });

  it('supports asynchronous Standard Schemas', async () => {
    const asyncPositive: StandardSchemaV1<unknown, number> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async value =>
          typeof value === 'number' && value > 0 ? { value } : { issues: [{ message: 'nope' }] }
      }
    };
    const s = make({ schema: asyncPositive, onInvalid: vi.fn() });
    expect(await s.set('n', 2)).toBe(true);
    expect(await s.get('n')).toBe(2);
    await expect(s.set('n', 0)).rejects.toBeInstanceOf(StorageValidationError);
  });

  it('migrates version-less items through the migrations chain once and writes back', async () => {
    await make().set('u', { fullName: 'Ada Lovelace' });
    const step1 = vi.fn((old: { fullName: string }) => {
      const [first, last] = old.fullName.split(' ');
      return { first, last };
    });
    const step2 = vi.fn((old: Record<string, unknown>) => ({ ...old, v2: true }));
    const s = make({ version: 2, migrations: { 1: step1, 2: step2 } });

    expect(await s.get('u')).toEqual({ first: 'Ada', last: 'Lovelace', v2: true });
    expect(step1).toHaveBeenCalledWith({ fullName: 'Ada Lovelace' }, 0);
    expect(step2).toHaveBeenCalledTimes(1);
    const raw = JSON.parse((await rawGet(PREFIX + 'u')) as string);
    expect(raw.v).toBe(2);

    expect(await s.get('u')).toEqual({ first: 'Ada', last: 'Lovelace', v2: true });
    expect(step1).toHaveBeenCalledTimes(1);

    await s.set('n', { first: 'Grace', last: 'Hopper' });
    expect(JSON.parse((await rawGet(PREFIX + 'n')) as string).v).toBe(2);
  });
});

describe('useIndexedDB', () => {
  const opts = { dbName: DB, prefix: PREFIX };

  it('hydrates asynchronously and flips isReady', async () => {
    await make().set('k', 'stored');
    const r = useIndexedDB('k', 'default', opts);
    expect(r.data.value).toBe('default');
    expect(r.isReady.value).toBe(false);
    await waitFor(() => r.isReady.value);
    expect(r.data.value).toBe('stored');
    expect(r.error.value).toBeNull();

    const missing = useIndexedDB('missing', { n: 1 }, opts);
    await waitFor(() => missing.isReady.value);
    expect(missing.data.value).toEqual({ n: 1 });
    // 默认值不会被写回
    expect(await rawGet(PREFIX + 'missing')).toBeUndefined();
  });

  it('debounces reactive edits into one write and flushes them', async () => {
    const r = useIndexedDB('obj', { n: 0, list: [] as number[] }, opts);
    await waitFor(() => r.isReady.value);
    const setSpy = vi.spyOn(r.storage, 'set');

    r.data.value.n = 1;
    r.data.value.list.push(2);
    r.data.value.n = 3;
    expect(setSpy).not.toHaveBeenCalled();
    expect(await r.flush()).toBe(true);
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(await make().get('obj')).toEqual({ n: 3, list: [2] });

    // 不手动 flush 时由定时器写入
    r.data.value.n = 4;
    await sleep(20);
    expect(await make().get('obj')).toEqual({ n: 4, list: [2] });
    expect(await r.flush()).toBe(true);
    expect(setSpy).toHaveBeenCalledTimes(2);
  });

  it('setValue writes immediately with options; remove resets without writing back', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const r = useIndexedDB('tok', '', opts);
    await waitFor(() => r.isReady.value);
    expect(await r.setValue('abc', { expires: 1000 })).toBe(true);
    expect(await make().get('tok')).toBe('abc');
    r.data.value = 'def';
    expect(await r.flush()).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(await make().get('tok')).toBeNull();

    await r.setValue('again');
    expect(await make().get('tok')).toBe('again');
    expect(await r.remove()).toBe(true);
    expect(r.data.value).toBe('');
    await sleep(20);
    expect(await rawGet(PREFIX + 'tok')).toBeUndefined();

    r.data.value = 'after-remove';
    expect(await r.flush()).toBe(true);
    expect(await make().get('tok')).toBe('after-remove');
  });

  it('keeps local writes made while hydration is still pending', async () => {
    await make().set('race', 'stored');
    const r = useIndexedDB('race', 'default', opts);
    r.data.value = 'local';
    await waitFor(() => r.isReady.value);
    expect(r.data.value).toBe('local');
    expect(await r.flush()).toBe(true);
    expect(await make().get('race')).toBe('local');
  });

  it('surfaces write errors through `error` and onError', async () => {
    const onError = vi.fn();
    const r = useIndexedDB('n', 1, { ...opts, schema: positive, onError });
    await waitFor(() => r.isReady.value);
    r.data.value = -5;
    expect(await r.flush()).toBe(false);
    expect(r.error.value).toBeInstanceOf(StorageValidationError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(await rawGet(PREFIX + 'n')).toBeUndefined();

    expect(await r.setValue(3)).toBe(true);
    expect(r.error.value).toBeNull();
    expect(await make().get('n')).toBe(3);
  });

  it('syncs between instances through a BroadcastChannel derived from dbName + prefix', async () => {
    const a = useIndexedDB('shared', 'a', opts);
    const b = useIndexedDB('shared', 'a', opts);
    const solo = useIndexedDB('shared', 'a', { ...opts, syncAcrossTabs: false });
    await waitFor(() => a.isReady.value && b.isReady.value && solo.isReady.value);
    expect(a.storage).not.toBe(b.storage);
    expect(a.storage.channelName).toBe(indexedDBChannelName(DB, PREFIX));
    expect(a.storage.channelName).toBe('vue-web-super-storage:test-db:idb-');

    const setSpy = vi.spyOn(a.storage, 'set');
    expect(await b.setValue('from-b')).toBe(true);
    await waitFor(() => a.data.value === 'from-b');
    expect(setSpy).not.toHaveBeenCalled();
    expect(solo.data.value).toBe('a');

    expect(await b.remove()).toBe(true);
    await waitFor(() => a.data.value === 'a');

    await b.setValue('again');
    await waitFor(() => a.data.value === 'again');
    expect(await b.storage.clear()).toBe(true);
    await waitFor(() => a.data.value === 'a');
  });

  it('stops with the effect scope and flushes pending writes first', async () => {
    const scope = effectScope();
    const r = scope.run(() => useIndexedDB('scoped', 'x', opts))!;
    await waitFor(() => r.isReady.value);
    r.data.value = 'written';
    scope.stop();
    await sleep(20);
    expect(await make().get('scoped')).toBe('written');

    r.data.value = 'ignored';
    await sleep(20);
    expect(await make().get('scoped')).toBe('written');
  });

  it('without IndexedDB everything is a no-op and warns exactly once', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(hasIndexedDB()).toBe(false);
    const s = make();
    expect(s.isAvailable()).toBe(false);
    expect(await s.get('x')).toBeNull();
    expect(await s.get('x', { defaultValue: 'd' })).toBe('d');
    expect(await s.set('x', 1)).toBe(false);
    expect(await s.has('x')).toBe(false);
    expect(await s.remove('x')).toBe(false);
    expect(await s.clear()).toBe(false);
    expect(await s.keys()).toEqual([]);
    expect(await s.getAll()).toEqual({});
    expect(await s.clearExpired()).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('IndexedDB is not available');

    const r = useIndexedDB('k', 'd', opts);
    await waitFor(() => r.isReady.value);
    expect(r.data.value).toBe('d');
    expect(await r.setValue('v')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
