import { ref, Ref, watch, getCurrentScope, onScopeDispose } from 'vue';
import { WebStorage } from './storage';
import { StorageType, StorageOptions, SetOptions, GetOptions, UseStorageOptions } from './types';

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
  const { syncAcrossTabs = true, ...storageOptions } = options;
  const storage = new WebStorage(storageOptions);

  const readFromStorage = (): T => {
    const stored = storage.get<T>(key, { defaultValue });
    return (stored ?? defaultValue) as T;
  };

  const state = ref<T>(readFromStorage()) as Ref<T>;
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
    assignSilently(value);
    storage.set(key, value, setOptions);
  };

  const remove = () => {
    storage.remove(key);
    assignSilently(defaultValue);
  };

  const refresh = () => {
    assignSilently(readFromStorage());
  };

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
