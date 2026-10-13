import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { WebStorage, __resetCleanupRegistry } from '../src/storage';
import { StorageValidationError } from '../src/schema';
import { useLocalStorage } from '../src/composables';
import type { StandardSchemaV1 } from '../src/types';

const PREFIX = 'sc-';

beforeEach(() => {
  localStorage.clear();
  __resetCleanupRegistry();
});

/** 手写的 Standard Schema：正数 */
const positive: StandardSchemaV1<unknown, number> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: value =>
      typeof value === 'number' && value > 0 ? { value } : { issues: [{ message: 'expected a positive number' }] }
  }
};

/** 1.1.0 风格的明文信封（没有 v 字段） */
const legacyItem = (value: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ value, expires: null, created: 1, ...extra });

describe('schema validation (sync storage)', () => {
  it('write validation throws StorageValidationError and persists nothing', () => {
    const s = new WebStorage({ prefix: PREFIX, schema: positive });
    let caught: unknown;
    try {
      s.set('n', -1);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StorageValidationError);
    const err = caught as StorageValidationError;
    expect(err.key).toBe('n');
    expect(err.issues).toHaveLength(1);
    expect(err.message).toContain('"n"');
    expect(err.message).toContain('expected a positive number');
    expect(localStorage.getItem(PREFIX + 'n')).toBeNull();

    expect(s.set('n', 5)).toBe(true);
    expect(s.get('n')).toBe(5);
  });

  it('function schemas normalise before persisting and wrap thrown errors', () => {
    const trimmed = (value: unknown) => {
      if (typeof value !== 'string') throw new Error('not a string');
      return value.trim();
    };
    const s = new WebStorage({ prefix: PREFIX, schema: trimmed });
    expect(s.set('s', '  hi  ')).toBe(true);
    expect(JSON.parse(localStorage.getItem(PREFIX + 's')!).value).toBe('hi');
    expect(s.get('s')).toBe('hi');

    let caught: unknown;
    try {
      s.set('s', 1);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StorageValidationError);
    expect((caught as StorageValidationError).cause).toBeInstanceOf(Error);
    expect((caught as StorageValidationError).message).toContain('not a string');
  });

  it('read validation falls back to the default, calls onInvalid and leaves the raw entry alone', () => {
    localStorage.setItem(PREFIX + 'n', legacyItem('oops'));
    const onInvalid = vi.fn();
    const s = new WebStorage({ prefix: PREFIX, schema: positive, onInvalid });

    expect(s.get('n')).toBeNull();
    expect(s.get('n', { defaultValue: 1 })).toBe(1);
    expect(onInvalid).toHaveBeenCalledWith('n', expect.any(StorageValidationError));
    expect(s.has('n')).toBe(false);
    expect(s.keys()).toEqual([]);
    expect(s.getAll()).toEqual({});
    // 不会删除原数据，只是当作不存在
    expect(localStorage.getItem(PREFIX + 'n')).not.toBeNull();
  });

  it('default onInvalid warns through console.warn outside production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(PREFIX + 'n', legacyItem('oops'));
    expect(new WebStorage({ prefix: PREFIX, schema: positive }).get('n')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"n"');
  });

  it('per-call schema overrides the instance-level one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = new WebStorage({ prefix: PREFIX });
    expect(() => s.set('n', -1, { schema: positive })).toThrow(StorageValidationError);
    expect(s.set('n', -1)).toBe(true);
    expect(s.get('n', { schema: positive, defaultValue: 0 })).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(s.get('n')).toBe(-1);
  });

  it('zod schemas work through the Standard Schema interface', () => {
    const User = z.object({ id: z.number(), tags: z.array(z.string()).default([]) });
    const s = new WebStorage({ prefix: PREFIX, schema: User });
    expect(s.set('u', { id: 1 })).toBe(true);
    // zod 的 default 在写入前应用，落盘的是规范化后的值
    expect(JSON.parse(localStorage.getItem(PREFIX + 'u')!).value).toEqual({ id: 1, tags: [] });
    expect(s.get('u')).toEqual({ id: 1, tags: [] });

    let caught: unknown;
    try {
      s.set('u', { id: 'x' } as unknown as { id: number });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StorageValidationError);
    expect((caught as StorageValidationError).issues[0].path).toEqual(['id']);
    expect((caught as StorageValidationError).message).toContain('id:');
  });

  it('asynchronous Standard Schemas are rejected by the synchronous API', () => {
    const asyncSchema: StandardSchemaV1<unknown, number> = {
      '~standard': { version: 1, vendor: 'test', validate: async value => ({ value: value as number }) }
    };
    const s = new WebStorage({ prefix: PREFIX, schema: asyncSchema });
    expect(() => s.set('n', 1)).toThrow(/IndexedDB/);
    expect(localStorage.getItem(PREFIX + 'n')).toBeNull();
  });
});

describe('versioned migrations (sync storage)', () => {
  it('without a version option the envelope is byte-compatible with 1.1.0', () => {
    const s = new WebStorage({ prefix: PREFIX });
    s.set('k', 1);
    const parsed = JSON.parse(localStorage.getItem(PREFIX + 'k')!);
    expect(Object.keys(parsed)).toEqual(['value', 'expires', 'created']);
  });

  it('writes v, treats version-less items as 0, migrates once and writes the result back', () => {
    localStorage.setItem(PREFIX + 'u', legacyItem({ fullName: 'Ada Lovelace' }));
    const calls: number[] = [];
    const s = new WebStorage({
      prefix: PREFIX,
      version: 1,
      migrate: (old: { fullName: string }, from) => {
        calls.push(from);
        const [first, last] = old.fullName.split(' ');
        return { first, last };
      }
    });

    expect(s.get('u')).toEqual({ first: 'Ada', last: 'Lovelace' });
    expect(calls).toEqual([0]);
    const raw = JSON.parse(localStorage.getItem(PREFIX + 'u')!);
    expect(raw.v).toBe(1);
    expect(raw.value).toEqual({ first: 'Ada', last: 'Lovelace' });
    expect(raw.expires).toBeNull();

    expect(s.get('u')).toEqual({ first: 'Ada', last: 'Lovelace' });
    expect(calls).toEqual([0]);

    s.set('n', { first: 'Grace', last: 'Hopper' });
    expect(JSON.parse(localStorage.getItem(PREFIX + 'n')!).v).toBe(1);
  });

  it('migrations map runs each step in order, skips missing steps and wins over migrate', () => {
    localStorage.setItem(PREFIX + 'a', legacyItem({ a: 1 }, { v: 1 }));
    localStorage.setItem(PREFIX + 'b', legacyItem({ a: 1 }));
    const order: number[] = [];
    const migrate = vi.fn();
    const s = new WebStorage({
      prefix: PREFIX,
      version: 4,
      migrate,
      migrations: {
        2: (v: Record<string, number>, from) => {
          order.push(from);
          return { ...v, b: 2 };
        },
        4: (v: Record<string, number>, from) => {
          order.push(from);
          return { ...v, d: 4 };
        }
      }
    });
    expect(s.get('a')).toEqual({ a: 1, b: 2, d: 4 });
    expect(order).toEqual([1, 3]);
    expect(JSON.parse(localStorage.getItem(PREFIX + 'a')!).v).toBe(4);

    order.length = 0;
    expect(s.get('b')).toEqual({ a: 1, b: 2, d: 4 });
    expect(order).toEqual([1, 3]);
    expect(migrate).not.toHaveBeenCalled();
  });

  it('a migration that throws falls back to the default and calls onInvalid', () => {
    const raw = legacyItem({ a: 1 });
    localStorage.setItem(PREFIX + 'u', raw);
    const onInvalid = vi.fn();
    const s = new WebStorage({
      prefix: PREFIX,
      version: 2,
      onInvalid,
      migrate: () => {
        throw new Error('cannot migrate');
      }
    });
    expect(s.get('u', { defaultValue: 'd' })).toBe('d');
    expect(onInvalid).toHaveBeenCalledWith('u', expect.any(Error));
    expect(localStorage.getItem(PREFIX + 'u')).toBe(raw);
  });

  it('migrated values are validated and obfuscated items stay obfuscated after write-back', () => {
    new WebStorage({ prefix: PREFIX, encrypt: true }).set('e', { n: 1 });
    const s = new WebStorage({
      prefix: PREFIX,
      encrypt: true,
      version: 2,
      migrate: (old: { n: number }) => ({ n: old.n * 10 }),
      schema: (value: unknown) => {
        if (typeof (value as { n: unknown }).n !== 'number') throw new Error('n must be a number');
        return value as { n: number };
      }
    });
    expect(s.get('e')).toEqual({ n: 10 });
    const raw = localStorage.getItem(PREFIX + 'e')!;
    expect(JSON.parse(raw)).toMatchObject({ encrypted: true });
    expect(raw).not.toContain('"n"');
    // 写回后带版本号，不会再次迁移
    expect(s.get('e')).toEqual({ n: 10 });

    // 迁移结果不通过校验 → 默认值
    const onInvalid = vi.fn();
    localStorage.setItem(PREFIX + 'bad', legacyItem({ n: 'x' }));
    const t = new WebStorage({
      prefix: PREFIX,
      version: 1,
      onInvalid,
      migrate: v => v,
      schema: positive
    });
    expect(t.get('bad', { defaultValue: 1 })).toBe(1);
    expect(onInvalid).toHaveBeenCalledWith('bad', expect.any(StorageValidationError));
  });

  it('items with a newer version than the instance are returned untouched', () => {
    localStorage.setItem(PREFIX + 'f', legacyItem({ future: true }, { v: 5 }));
    const migrate = vi.fn();
    const s = new WebStorage({ prefix: PREFIX, version: 2, migrate });
    expect(s.get('f')).toEqual({ future: true });
    expect(migrate).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(PREFIX + 'f')!).v).toBe(5);
  });

  it('rejects invalid version values', () => {
    expect(() => new WebStorage({ version: 1.5 })).toThrow(TypeError);
    expect(() => new WebStorage({ version: -1 })).toThrow(TypeError);
    expect(() => new WebStorage({ version: 0 })).not.toThrow();
  });
});

describe('schema + version through the composables', () => {
  it('invalid stored data yields the default and invalid writes throw without touching the ref', () => {
    localStorage.setItem(PREFIX + 'n', legacyItem('oops'));
    const onInvalid = vi.fn();
    const r = useLocalStorage('n', 1, { prefix: PREFIX, schema: positive, onInvalid });
    expect(r.state.value).toBe(1);
    expect(onInvalid).toHaveBeenCalledTimes(1);

    expect(() => r.setValue(-3)).toThrow(StorageValidationError);
    expect(r.state.value).toBe(1);
    expect(localStorage.getItem(PREFIX + 'n')).toBe(legacyItem('oops'));

    r.setValue(7);
    expect(r.state.value).toBe(7);
    expect(new WebStorage({ prefix: PREFIX }).get('n')).toBe(7);
  });

  it('version + migrate run during the initial read', () => {
    localStorage.setItem(PREFIX + 'u', legacyItem({ fullName: 'Ada Lovelace' }));
    const [user] = useLocalStorage(
      'u',
      { first: '', last: '' },
      {
        prefix: PREFIX,
        version: 1,
        migrate: (old: { fullName: string }) => {
          const [first, last] = old.fullName.split(' ');
          return { first, last };
        }
      }
    );
    expect(user.value).toEqual({ first: 'Ada', last: 'Lovelace' });
    user.value.first = 'Augusta';
    const raw = JSON.parse(localStorage.getItem(PREFIX + 'u')!);
    expect(raw.v).toBe(1);
    expect(raw.value).toEqual({ first: 'Augusta', last: 'Lovelace' });
  });
});
