import { ref, Ref, watch, getCurrentScope, onScopeDispose, getCurrentInstance, onMounted } from 'vue';
import { WebStorage } from './storage';
import { IndexedDBStorage, createIndexedDBStorage } from './indexeddb';
import {
  StorageType,
  StorageOptions,
  SetOptions,
  GetOptions,
  UseStorageOptions,
  UseIndexedDBOptions
} from './types';

/**
 * useStorage 的返回值：兼容 1.0.x 的三元组，同时附带具名属性
 */
export type UseStorageReturn<T> = [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void] & {
  /** 响应式状态 */
  state: Ref<T>;
  /** 写入新值（可带 expires / encrypt），后续响应式修改沿用同一组选项 */
  setValue: (value: T, setOptions?: SetOptions) => void;
  /** 从 storage 删除并把 ref 重置为默认值，不会再写回 */
  removeValue: () => void;
  /** 从 storage 重新读取 */
  refresh: () => void;
  /** 停止监听（watch / storage 事件） */
  stop: () => void;
  /** 底层 WebStorage 实例 */
  storage: WebStorage;
};

interface StorageRefController<T> {
  state: Ref<T>;
  setValue: (value: T, setOptions?: SetOptions) => void;
  remove: () => void;
  refresh: () => void;
  stop: () => void;
  storage: WebStorage;
}

/**
 * 创建一个与 storage 双向绑定的 ref。
 * - ref 的任何修改（含深层）同步写入 storage，并沿用最近一次 setValue 的选项；
 * - setValue / remove / refresh / 跨标签页同步 对 ref 的赋值不会触发回写；
 * - 可选监听 window 'storage' 事件实现跨标签页同步。
 */
function createStorageRef<T>(
  key: string,
  defaultValue: T,
  options: UseStorageOptions
): StorageRefController<T> {
  const { syncAcrossTabs = true, initOnMounted = false, ...storageOptions } = options;
  const storage = new WebStorage(storageOptions);

  const readFromStorage = (): T => {
    const stored = storage.get<T>(key, { defaultValue });
    return (stored ?? defaultValue) as T;
  };

  // initOnMounted：先渲染默认值，挂载后再读 storage，避免 SSR 注水不匹配
  const state = ref<T>(initOnMounted ? defaultValue : readFromStorage()) as Ref<T>;
  let lastSetOptions: SetOptions | undefined;
  let paused = false;

  const assignSilently = (value: T) => {
    paused = true;
    try {
      state.value = value;
    } finally {
      paused = false;
    }
  };

  // flush: 'sync' 保证 paused 标记能精确覆盖我们自己的赋值
  const stopWatcher = watch(
    state,
    newValue => {
      if (paused) return;
      storage.set(key, newValue, lastSetOptions);
    },
    { deep: true, flush: 'sync' }
  );

  const setValue = (value: T, setOptions?: SetOptions) => {
    lastSetOptions = setOptions;
    // 先写 storage：schema 校验失败会同步抛错，此时 ref 保持原值
    storage.set(key, value, setOptions);
    assignSilently(value);
  };

  const remove = () => {
    storage.remove(key);
    assignSilently(defaultValue);
  };

  const refresh = () => {
    assignSilently(readFromStorage());
  };

  if (initOnMounted) {
    if (getCurrentInstance()) {
      onMounted(refresh);
    } else {
      refresh();
    }
  }

  let stopSync: (() => void) | undefined;
  if (syncAcrossTabs && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const fullKey = storage.getFullKey(key);
    const handler = (event: StorageEvent) => {
      const native = storage.getStorage();
      if (event.storageArea && native && event.storageArea !== native) return;
      // key === null 表示对方调用了 clear()
      if (event.key !== null && event.key !== fullKey) return;
      refresh();
    };
    window.addEventListener('storage', handler);
    stopSync = () => window.removeEventListener('storage', handler);
  }

  const stop = () => {
    stopWatcher();
    stopSync?.();
    stopSync = undefined;
  };

  if (getCurrentScope()) {
    onScopeDispose(stop);
  }

  return { state, setValue, remove, refresh, stop, storage };
}

/**
 * 响应式存储组合函数
 */
export function useStorage<T = any>(
  key: string,
  defaultValue?: T,
  options: UseStorageOptions = {}
): UseStorageReturn<T> {
  const ctrl = createStorageRef<T>(key, defaultValue as T, options);
  const result = [ctrl.state, ctrl.setValue, ctrl.remove] as unknown as UseStorageReturn<T>;
  result.state = ctrl.state;
  result.setValue = ctrl.setValue;
  result.removeValue = ctrl.remove;
  result.refresh = ctrl.refresh;
  result.stop = ctrl.stop;
  result.storage = ctrl.storage;
  return result;
}

/**
 * localStorage 组合函数
 */
export function useLocalStorage<T = any>(
  key: string,
  defaultValue?: T,
  options: Omit<UseStorageOptions, 'type'> = {}
): UseStorageReturn<T> {
  return useStorage(key, defaultValue, { ...options, type: StorageType.LOCAL });
}

/**
 * sessionStorage 组合函数
 */
export function useSessionStorage<T = any>(
  key: string,
  defaultValue?: T,
  options: Omit<UseStorageOptions, 'type'> = {}
): UseStorageReturn<T> {
  return useStorage(key, defaultValue, { ...options, type: StorageType.SESSION });
}

/**
 * 存储状态管理器（面向对象风格的 useStorage）
 */
export class StorageState<T = any> {
  private readonly ctrl: StorageRefController<T>;

  constructor(key: string, defaultValue: T, options: UseStorageOptions = {}) {
    this.ctrl = createStorageRef<T>(key, defaultValue, options);
  }

  /** 获取当前值 */
  get value(): T {
    return this.ctrl.state.value;
  }

  /** 设置值（沿用最近一次 setValue 的选项） */
  set value(newValue: T) {
    this.ctrl.state.value = newValue;
  }

  /** 获取响应式引用 */
  get ref(): Ref<T> {
    return this.ctrl.state;
  }

  /** 底层 WebStorage 实例 */
  get storage(): WebStorage {
    return this.ctrl.storage;
  }

  /** 设置值（带选项） */
  setValue(value: T, options?: SetOptions): void {
    this.ctrl.setValue(value, options);
  }

  /** 重置为默认值：等价于 remove()，从 storage 删除且不写回默认值 */
  reset(): void {
    this.ctrl.remove();
  }

  /** 从存储中移除并把状态重置为默认值 */
  remove(): void {
    this.ctrl.remove();
  }

  /** 从存储重新读取 */
  refresh(): void {
    this.ctrl.refresh();
  }

  /** 停止监听，释放资源 */
  destroy(): void {
    this.ctrl.stop();
  }
}

/**
 * 创建存储状态
 */
export function createStorageState<T = any>(
  key: string,
  defaultValue: T,
  options: UseStorageOptions = {}
): StorageState<T> {
  return new StorageState(key, defaultValue, options);
}

/**
 * 批量存储操作
 */
export function useBatchStorage(options: StorageOptions = {}) {
  const storage = new WebStorage(options);

  const batchSet = (items: Record<string, any>, setOptions?: SetOptions) => {
    Object.entries(items).forEach(([key, value]) => {
      storage.set(key, value, setOptions);
    });
  };

  const batchGet = <T = any>(keys: string[], getOptions?: GetOptions<T>): Record<string, T | null> => {
    const result: Record<string, T | null> = {};
    keys.forEach(key => {
      result[key] = storage.get<T>(key, getOptions);
    });
    return result;
  };

  const batchRemove = (keys: string[]) => {
    keys.forEach(key => {
      storage.remove(key);
    });
  };

  return {
    storage,
    batchSet,
    batchGet,
    batchRemove
  };
}

/**
 * useIndexedDB 的返回值
 */
export interface UseIndexedDBReturn<T> {
  /** 响应式数据；初始为默认值，从 IndexedDB 读取完成后更新 */
  data: Ref<T>;
  /** 首次读取（或读取失败）完成后变为 true。服务端始终为 false */
  isReady: Ref<boolean>;
  /** 最近一次读 / 写失败的错误，成功后清空 */
  error: Ref<unknown>;
  /** 重新从 IndexedDB 读取 */
  refresh: () => Promise<void>;
  /** 删除并把 ref 重置为默认值，不会再写回 */
  remove: () => Promise<boolean>;
  /** 立即写入（可带 expires / encrypt），后续响应式修改沿用同一组选项 */
  setValue: (value: T, setOptions?: SetOptions) => Promise<boolean>;
  /** 立刻把待写入的变更刷到 IndexedDB；没有待写入时 resolve true */
  flush: () => Promise<boolean>;
  /** 停止监听并刷出待写入的变更 */
  stop: () => void;
  /** 底层 IndexedDBStorage 实例 */
  storage: IndexedDBStorage;
}

/**
 * 与 IndexedDB 双向绑定的 ref。
 * - 初始值为 defaultValue，异步读取完成后更新并把 isReady 置为 true；
 * - ref 的修改（含深层）按 debounce 合并后写入；
 * - 通过 BroadcastChannel 跟随其他标签页的修改（需要浏览器支持）；
 * - 服务端不读取、不写入，也不会打印警告。
 */
export function useIndexedDB<T = any>(
  key: string,
  defaultValue: T,
  options: UseIndexedDBOptions<T> & { storage?: IndexedDBStorage } = {}
): UseIndexedDBReturn<T> {
  const { syncAcrossTabs = true, debounce = 0, onError, storage: providedStorage, ...storageOptions } = options;
  const storage = providedStorage ?? createIndexedDBStorage<T>(storageOptions);
  const inBrowser = typeof window !== 'undefined';

  const data = ref(defaultValue) as Ref<T>;
  const isReady = ref(false);
  const error = ref<unknown>(null);

  let paused = false;
  let dirty = false;
  let writeSeq = 0;
  let lastSetOptions: SetOptions | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const assignSilently = (value: T) => {
    paused = true;
    try {
      data.value = value;
    } finally {
      paused = false;
    }
  };

  const reportError = (e: unknown) => {
    error.value = e;
    if (onError) onError(e);
    else console.error('[vue-web-super-storage] useIndexedDB write error:', e);
  };

  const flush = (): Promise<boolean> => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (!dirty) return Promise.resolve(true);
    dirty = false;
    return storage.set(key, data.value, lastSetOptions).then(
      ok => {
        if (ok) error.value = null;
        return ok;
      },
      e => {
        reportError(e);
        return false;
      }
    );
  };

  const schedule = () => {
    writeSeq++;
    dirty = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, debounce);
  };

  const stopWatcher = watch(
    data,
    () => {
      if (paused || stopped) return;
      schedule();
    },
    { deep: true, flush: 'sync' }
  );

  const refresh = async (): Promise<void> => {
    const seq = writeSeq;
    try {
      const stored = await storage.get<T>(key, { defaultValue });
      // 读取期间发生了本地写入：以本地为准，不回退
      if (seq !== writeSeq) return;
      assignSilently((stored ?? defaultValue) as T);
      error.value = null;
    } catch (e) {
      error.value = e;
    } finally {
      isReady.value = true;
    }
  };

  const setValue = (value: T, setOptions?: SetOptions): Promise<boolean> => {
    lastSetOptions = setOptions;
    writeSeq++;
    assignSilently(value);
    dirty = true;
    return flush();
  };

  const remove = async (): Promise<boolean> => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    dirty = false;
    writeSeq++;
    assignSilently(defaultValue);
    return storage.remove(key);
  };

  let unsubscribe: (() => void) | undefined;
  if (syncAcrossTabs && inBrowser) {
    unsubscribe = storage.subscribe(message => {
      if (message.type === 'clear' || message.key === key) {
        void refresh();
      }
    });
  }

  const onPageHide = () => {
    void flush();
  };
  if (inBrowser && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', onPageHide);
  }

  const stop = () => {
    if (stopped) return;
    stopped = true;
    stopWatcher();
    unsubscribe?.();
    unsubscribe = undefined;
    if (inBrowser && typeof window.removeEventListener === 'function') {
      window.removeEventListener('pagehide', onPageHide);
    }
    void flush();
  };

  if (getCurrentScope()) {
    onScopeDispose(stop);
  }

  if (inBrowser) {
    void refresh();
  }

  return { data, isReady, error, refresh, remove, setValue, flush, stop, storage };
}
