import { ref, Ref, watch, onUnmounted } from 'vue';
import { WebStorage } from './storage';
import { StorageType, StorageOptions, SetOptions, GetOptions } from './types';

/**
 * 响应式存储组合函数
 */
export function useStorage<T = any>(
  key: string,
  defaultValue?: T,
  options: StorageOptions = {}
): [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void] {
  const storage = new WebStorage(options);
  
  // 创建响应式引用
  const storedValue = storage.get<T>(key, { defaultValue });
  const state = ref<T>(storedValue ?? defaultValue) as Ref<T>;

  // 设置值的函数
  const setValue = (value: T, setOptions?: SetOptions) => {
    state.value = value;
    storage.set(key, value, setOptions);
  };

  // 移除值的函数
  const removeValue = () => {
    storage.remove(key);
    state.value = defaultValue as T;
  };

  // 监听状态变化并同步到存储
  const stopWatcher = watch(
    state,
    (newValue) => {
      storage.set(key, newValue);
    },
    { deep: true }
  );

  // 组件卸载时停止监听
  onUnmounted(() => {
    stopWatcher();
  });

  return [state, setValue, removeValue];
}

/**
 * localStorage 组合函数
 */
export function useLocalStorage<T = any>(
  key: string,
  defaultValue?: T,
  options: Omit<StorageOptions, 'type'> = {}
): [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void] {
  return useStorage(key, defaultValue, { ...options, type: StorageType.LOCAL });
}

/**
 * sessionStorage 组合函数
 */
export function useSessionStorage<T = any>(
  key: string,
  defaultValue?: T,
  options: Omit<StorageOptions, 'type'> = {}
): [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void] {
  return useStorage(key, defaultValue, { ...options, type: StorageType.SESSION });
}

/**
 * 存储状态管理器
 */
export class StorageState<T = any> {
  private storage: WebStorage;
  private state: Ref<T>;
  private stopWatcher?: () => void;

  constructor(
    private key: string,
    private defaultValue: T,
    options: StorageOptions = {}
  ) {
    this.storage = new WebStorage(options);
    
    const storedValue = this.storage.get<T>(key, { defaultValue });
    this.state = ref<T>(storedValue ?? defaultValue) as Ref<T>;

    this.startWatching();
  }

  /**
   * 开始监听状态变化
   */
  private startWatching(): void {
    this.stopWatcher = watch(
      this.state,
      (newValue) => {
        this.storage.set(this.key, newValue);
      },
      { deep: true }
    );
  }

  /**
   * 获取当前值
   */
  get value(): T {
    return this.state.value;
  }

  /**
   * 设置值
   */
  set value(newValue: T) {
    this.state.value = newValue;
  }

  /**
   * 获取响应式引用
   */
  get ref(): Ref<T> {
    return this.state;
  }

  /**
   * 设置值（带选项）
   */
  setValue(value: T, options?: SetOptions): void {
    this.state.value = value;
    this.storage.set(this.key, value, options);
  }

  /**
   * 重置为默认值
   */
  reset(): void {
    this.state.value = this.defaultValue;
  }

  /**
   * 从存储中移除
   */
  remove(): void {
    this.storage.remove(this.key);
    this.state.value = this.defaultValue;
  }

  /**
   * 刷新值（从存储重新读取）
   */
  refresh(): void {
    const storedValue = this.storage.get<T>(this.key, { defaultValue: this.defaultValue });
    this.state.value = storedValue ?? this.defaultValue;
  }

  /**
   * 停止监听
   */
  destroy(): void {
    if (this.stopWatcher) {
      this.stopWatcher();
      this.stopWatcher = undefined;
    }
  }
}

/**
 * 创建存储状态
 */
export function createStorageState<T = any>(
  key: string,
  defaultValue: T,
  options: StorageOptions = {}
): StorageState<T> {
  return new StorageState(key, defaultValue, options);
}

/**
 * 批量存储操作
 */
export function useBatchStorage(options: StorageOptions = {}) {
  const storage = new WebStorage(options);

  /**
   * 批量设置
   */
  const batchSet = (items: Record<string, any>, setOptions?: SetOptions) => {
    Object.entries(items).forEach(([key, value]) => {
      storage.set(key, value, setOptions);
    });
  };

  /**
   * 批量获取
   */
  const batchGet = <T = any>(keys: string[], getOptions?: GetOptions): Record<string, T> => {
    const result: Record<string, T> = {};
    keys.forEach(key => {
      result[key] = storage.get<T>(key, getOptions);
    });
    return result;
  };

  /**
   * 批量移除
   */
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
