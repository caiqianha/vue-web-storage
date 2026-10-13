// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createIndexedDBStorage, __resetIndexedDBWarning } from '../src/indexeddb';
import { useIndexedDB } from '../src/composables';

afterEach(() => {
  vi.unstubAllGlobals();
  __resetIndexedDBWarning();
});

describe('IndexedDB on the server (no window)', () => {
  it('useIndexedDB does not hydrate, does not warn, and the adapter is a warning no-op', async () => {
    expect(typeof window).toBe('undefined');
    vi.stubGlobal('indexedDB', undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => createIndexedDBStorage()).not.toThrow();

    const r = useIndexedDB('k', 'default');
    expect(r.data.value).toBe('default');
    expect(r.isReady.value).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(r.isReady.value).toBe(false);
    expect(warn).not.toHaveBeenCalled();

    // 显式调用适配器才会警告，而且只警告一次
    expect(await r.storage.get('k')).toBeNull();
    expect(await r.storage.set('k', 1)).toBe(false);
    expect(await r.storage.keys()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);

    expect(await r.setValue('v')).toBe(false);
    expect(r.data.value).toBe('v');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    r.stop();
  });

  it('even with an IndexedDB polyfill present, the composable waits for the browser', async () => {
    // test/setup.ts 引入了 fake-indexeddb，此处 indexedDB 存在但 window 不存在
    expect(typeof indexedDB).not.toBe('undefined');
    const r = useIndexedDB('k', 'default');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(r.isReady.value).toBe(false);
    expect(r.data.value).toBe('default');
    r.stop();
  });
});
