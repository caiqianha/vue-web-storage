import {
  StorageType,
  StorageItem,
  StorageOptions,
  SetOptions,
  GetOptions,
  StorageStats,
  StorageEventType,
  StorageEventData,
  StorageEventListener
} from './types';
import {
  isExpired,
  calculateExpires,
  serialize,
  deserialize,
  getStorageSize,
  deepClone
} from './utils';

/**
 * WebStorage 封装类
 */
export class WebStorage {
  private storage: Storage;
  private options: Required<StorageOptions>;
  private listeners: Map<StorageEventType, Set<StorageEventListener>> = new Map();

  constructor(options: StorageOptions = {}) {
    this.options = {
      type: StorageType.LOCAL,
      defaultExpires: 0,
      prefix: 'vue-storage-',
      encrypt: false,
      encryptKey: 'vue-web-storage',
      ...options
    };

    // 获取对应的 storage 对象
    this.storage = this.options.type === StorageType.LOCAL 
      ? localStorage 
      : sessionStorage;

    // 初始化时清理过期数据
    this.clearExpired();
  }

  /**
   * 生成完整的 key
   */
  private getFullKey(key: string): string {
    return this.options.prefix + key;
  }

  /**
   * 触发事件
   */
  private emit(type: StorageEventType, data: Partial<StorageEventData> = {}): void {
    const listeners = this.listeners.get(type);
    if (listeners && listeners.size > 0) {
      const eventData: StorageEventData = {
        type,
        timestamp: Date.now(),
        ...data
      };
      listeners.forEach(listener => {
        try {
          listener(eventData);
        } catch (error) {
          console.error('Storage event listener error:', error);
        }
      });
    }
  }

  /**
   * 设置存储项
   */
  set<T = any>(key: string, value: T, options: SetOptions = {}): boolean {
    try {
      const fullKey = this.getFullKey(key);
      const expires = calculateExpires(
        (options.expires ?? this.options.defaultExpires) || undefined
      );
      
      const item: StorageItem<T> = {
        value: deepClone(value),
        expires,
        created: Date.now()
      };

      const shouldEncrypt = options.encrypt ?? this.options.encrypt;
      const serializedData = serialize(item, shouldEncrypt, this.options.encryptKey);
      
      this.storage.setItem(fullKey, serializedData);
      
      this.emit('set', { key, value });
      return true;
    } catch (error) {
      console.error('Storage set error:', error);
      return false;
    }
  }

  /**
   * 获取存储项
   */
  get<T = any>(key: string, options: GetOptions = {}): T | null {
    try {
      const fullKey = this.getFullKey(key);
      const data = this.storage.getItem(fullKey);
      
      if (!data) {
        return (options.defaultValue ?? null) as T;
      }

      const item: StorageItem<T> = deserialize(
        data,
        this.options.encrypt,
        this.options.encryptKey
      );

      if (!item || typeof item !== 'object' || !('value' in item)) {
        return (options.defaultValue ?? null) as T;
      }

      // 检查是否过期
      if (isExpired(item.expires)) {
        this.remove(key);
        this.emit('expired', { key });
        return (options.defaultValue ?? null) as T;
      }

      this.emit('get', { key, value: item.value });
      return deepClone(item.value);
    } catch (error) {
      console.error('Storage get error:', error);
      return (options.defaultValue ?? null) as T;
    }
  }

  /**
   * 检查存储项是否存在且未过期
   */
  has(key: string): boolean {
    try {
      const fullKey = this.getFullKey(key);
      const data = this.storage.getItem(fullKey);
      
      if (!data) return false;

      const item: StorageItem = deserialize(
        data,
        this.options.encrypt,
        this.options.encryptKey
      );

      if (!item || typeof item !== 'object' || !('expires' in item)) {
        return false;
      }

      if (isExpired(item.expires)) {
        this.remove(key);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Storage has error:', error);
      return false;
    }
  }

  /**
   * 删除存储项
   */
  remove(key: string): boolean {
    try {
      const fullKey = this.getFullKey(key);
      this.storage.removeItem(fullKey);
      this.emit('remove', { key });
      return true;
    } catch (error) {
      console.error('Storage remove error:', error);
      return false;
    }
  }

  /**
   * 清空所有存储项（只清理带前缀的）
   */
  clear(): boolean {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key && key.startsWith(this.options.prefix)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        this.storage.removeItem(key);
      });

      this.emit('clear');
      return true;
    } catch (error) {
      console.error('Storage clear error:', error);
      return false;
    }
  }

  /**
   * 清理过期的存储项
   */
  clearExpired(): number {
    let clearedCount = 0;
    const keysToRemove: string[] = [];

    try {
      for (let i = 0; i < this.storage.length; i++) {
        const fullKey = this.storage.key(i);
        if (!fullKey || !fullKey.startsWith(this.options.prefix)) {
          continue;
        }

        const data = this.storage.getItem(fullKey);
        if (!data) continue;

        const item: StorageItem = deserialize(
          data,
          this.options.encrypt,
          this.options.encryptKey
        );

        if (item && typeof item === 'object' && 'expires' in item) {
          if (isExpired(item.expires)) {
            keysToRemove.push(fullKey);
          }
        }
      }

      keysToRemove.forEach(key => {
        this.storage.removeItem(key);
        clearedCount++;
      });

      if (clearedCount > 0) {
        this.emit('expired');
      }

      return clearedCount;
    } catch (error) {
      console.error('Storage clearExpired error:', error);
      return clearedCount;
    }
  }

  /**
   * 获取所有键名（不包含前缀）
   */
  keys(): string[] {
    const keys: string[] = [];
    const prefixLength = this.options.prefix.length;

    try {
      for (let i = 0; i < this.storage.length; i++) {
        const fullKey = this.storage.key(i);
        if (fullKey && fullKey.startsWith(this.options.prefix)) {
          const key = fullKey.substring(prefixLength);
          if (this.has(key)) {
            keys.push(key);
          }
        }
      }
    } catch (error) {
      console.error('Storage keys error:', error);
    }

    return keys;
  }

  /**
   * 获取存储统计信息
   */
  getStats(): StorageStats {
    let total = 0;
    let expired = 0;
    let valid = 0;
    let usedBytes = 0;

    try {
      for (let i = 0; i < this.storage.length; i++) {
        const fullKey = this.storage.key(i);
        if (!fullKey || !fullKey.startsWith(this.options.prefix)) {
          continue;
        }

        const data = this.storage.getItem(fullKey);
        if (!data) continue;

        total++;
        usedBytes += fullKey.length + data.length;

        const item: StorageItem = deserialize(
          data,
          this.options.encrypt,
          this.options.encryptKey
        );

        if (item && typeof item === 'object' && 'expires' in item) {
          if (isExpired(item.expires)) {
            expired++;
          } else {
            valid++;
          }
        } else {
          valid++; // 无过期时间的项目视为有效
        }
      }
    } catch (error) {
      console.error('Storage getStats error:', error);
    }

    return { total, expired, valid, usedBytes };
  }

  /**
   * 添加事件监听器
   */
  on(type: StorageEventType, listener: StorageEventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  /**
   * 移除事件监听器
   */
  off(type: StorageEventType, listener: StorageEventListener): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * 获取原始 Storage 对象
   */
  getStorage(): Storage {
    return this.storage;
  }

  /**
   * 获取配置选项
   */
  getOptions(): Readonly<Required<StorageOptions>> {
    return { ...this.options };
  }
}
