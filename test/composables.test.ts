import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import {
  useStorage,
  useLocalStorage,
  useSessionStorage,
  createStorageState,
  useBatchStorage
} from '../src/composables';
import { WebStorage, __resetCleanupRegistry } from '../src/storage';

const PREFIX = 'uc-';
const reader = () => new WebStorage({ prefix: PREFIX });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  __resetCleanupRegistry();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useStorage', () => {
  it('initialises from storage or the default value', () => {
    reader().set('k', 'stored');
    const [a] = useStorage('k', 'default', { prefix: PREFIX });
    const [b] = useStorage('other', 'default', { prefix: PREFIX });
    expect(a.value).toBe('stored');
    expect(b.value).toBe('default');
    expect(localStorage.getItem(PREFIX + 'other')).toBeNull();
  });

  it('writes through on assignment and deep mutation', () => {
    const [state] = useStorage('obj', { n: 0, list: [] as number[] }, { prefix: PREFIX });
    state.value = { n: 1, list: [] };
    expect(reader().get('obj')).toEqual({ n: 1, list: [] });
    state.value.list.push(7);
    state.value.n = 2;
    expect(reader().get('obj')).toEqual({ n: 2, list: [7] });
  });

  it('setValue options (expires) survive the watcher and later reactive edits', () => {
    vi.useFakeTimers();
    const [state, setValue] = useStorage('tok', '', { prefix: PREFIX });
    setValue('abc', { expires: 1000 });
    expect(reader().get('tok')).toBe('abc');
    vi.advanceTimersByTime(1001);
    expect(reader().get('tok')).toBeNull();

    setValue('def', { expires: 1000 });
    state.value = 'ghi';
    expect(reader().get('tok')).toBe('ghi');
    vi.advanceTimersByTime(1001);
    expect(reader().get('tok')).toBeNull();
  });

  it('setValue with encrypt: true obfuscates the stored value', () => {
    const result = useStorage('pw', '', { prefix: PREFIX });
    result.setValue('中文😀', { encrypt: true });
    expect(localStorage.getItem(PREFIX + 'pw')).not.toContain('中文');
    expect(reader().get('pw')).toBe('中文😀');
  });

  it('removeValue really removes and does not write the default back', async () => {
    const [state, , removeValue] = useStorage('k', 'default', { prefix: PREFIX });
    state.value = 'changed';
    expect(reader().has('k')).toBe(true);
    removeValue();
    expect(state.value).toBe('default');
    expect(reader().has('k')).toBe(false);
    await nextTick();
    expect(localStorage.getItem(PREFIX + 'k')).toBeNull();
    // 之后的修改照常写入
    state.value = 'again';
    expect(reader().get('k')).toBe('again');
  });

  it('exposes named helpers next to the tuple', () => {
    const result = useLocalStorage('named', 1, { prefix: PREFIX });
    expect(result.state.value).toBe(1);
    expect(result.storage).toBeInstanceOf(WebStorage);
    result.setValue(2);
    reader().set('named', 3);
    result.refresh();
    expect(result.state.value).toBe(3);
    result.stop();
    result.state.value = 4;
    expect(reader().get('named')).toBe(3);
  });

  it('does not warn when used outside a component and cleans up with the effect scope', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [outside] = useStorage('o', 'x', { prefix: PREFIX });
    outside.value = 'y';
    expect(warn).not.toHaveBeenCalled();

    const scope = effectScope();
    const [inside] = scope.run(() => useStorage('s', 'x', { prefix: PREFIX }))!;
    inside.value = 'written';
    expect(reader().get('s')).toBe('written');
    scope.stop();
    inside.value = 'ignored';
    expect(reader().get('s')).toBe('written');
  });

  it('useSessionStorage targets sessionStorage', () => {
    const [state] = useSessionStorage('sk', 'v', { prefix: PREFIX });
    state.value = 'w';
    expect(sessionStorage.getItem(PREFIX + 'sk')).not.toBeNull();
    expect(localStorage.getItem(PREFIX + 'sk')).toBeNull();
  });
});

describe('cross-tab sync', () => {
  it('updates the ref when another tab changes the same key, without writing back', () => {
    const [state, , , ] = [...useStorage('shared', 'a', { prefix: PREFIX })];
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');

    // 模拟另一个标签页写入
    const other = new WebStorage({ prefix: PREFIX });
    other.set('shared', 'from-other-tab');
    setSpy.mockClear();
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: PREFIX + 'shared',
        newValue: localStorage.getItem(PREFIX + 'shared'),
        storageArea: localStorage
      })
    );
    expect(state.value).toBe('from-other-tab');
    expect(setSpy).not.toHaveBeenCalled();

    // 不相关的 key 不影响
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', storageArea: localStorage }));
    expect(state.value).toBe('from-other-tab');

    // 另一个标签页 clear() → key 为 null → 回到默认值
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    expect(state.value).toBe('a');
  });

  it('can be turned off with syncAcrossTabs: false', () => {
    const [state] = useStorage('solo', 'a', { prefix: PREFIX, syncAcrossTabs: false });
    new WebStorage({ prefix: PREFIX }).set('solo', 'b');
    window.dispatchEvent(new StorageEvent('storage', { key: PREFIX + 'solo', storageArea: localStorage }));
    expect(state.value).toBe('a');
  });
});

describe('StorageState', () => {
  it('reset / remove actually remove and setValue keeps options', () => {
    vi.useFakeTimers();
    const st = createStorageState('state', { n: 0 }, { prefix: PREFIX });
    st.value = { n: 1 };
    expect(reader().get('state')).toEqual({ n: 1 });

    st.reset();
    expect(st.value).toEqual({ n: 0 });
    expect(reader().has('state')).toBe(false);

    st.setValue({ n: 5 }, { expires: 100 });
    st.ref.value.n = 6;
    expect(reader().get('state')).toEqual({ n: 6 });
    vi.advanceTimersByTime(101);
    expect(reader().has('state')).toBe(false);

    st.value = { n: 7 };
    st.remove();
    expect(reader().has('state')).toBe(false);
    st.destroy();
    st.value = { n: 8 };
    expect(reader().has('state')).toBe(false);
  });
});

describe('useBatchStorage', () => {
  it('sets, gets and removes in bulk', () => {
    const { batchSet, batchGet, batchRemove, storage } = useBatchStorage({ prefix: PREFIX });
    batchSet({ a: 1, b: 2 });
    expect(batchGet(['a', 'b', 'c'])).toEqual({ a: 1, b: 2, c: null });
    batchRemove(['a']);
    expect(storage.keys()).toEqual(['b']);
  });
});
