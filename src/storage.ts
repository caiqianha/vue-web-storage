import {
  StorageType,
  StorageItem,
  StorageOptions,
  SetOptions,
  GetOptions,
  StorageStats,
  StorageEventType,
  StorageEventData,
  StorageEventListener,
  EncryptedEnvelope
} from './types';
import {
  isExpired,
  calculateExpires,
  normalizeExpires,
  encrypt,
  decryptStrict,
  decryptLegacy
} from './utils';

export const DEFAULT_PREFIX = 'vue-storage-';
const DEFAULT_ENCRYPT_KEY = 'vue-web-storage';

/** 已经做过首次过期清理的 (type, prefix) 组合，整页生命周期内只清理一次 */
const cleanedScopes = new Set<string>();
/** 每个 (type, prefix) 只保留一个定时清理器 */
const cleanupTimers = new Map<string, ReturnType<typeof setInterval>>();

/** 是否处于浏览器环境 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

/**
 * 安全获取原生 Storage；非浏览器环境、或浏览器禁用了 storage（访问会抛 SecurityError）时返回 null
 */
export function resolveNativeStorage(type: StorageType): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = type === StorageType.SESSION ? window.sessionStorage : window.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as EncryptedEnvelope).encrypted === true &&
    typeof (value as EncryptedEnvelope).data === 'string'
  );
}

function isStorageItem(value: unknown): value is StorageItem {
  return !!value && typeof value === 'object' && 'value' in (value as object) && 'expires' in (value as object);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * WebStorage 封装类
 */
export class WebStorage {
  private nativeStorage: Storage | null | undefined;
  private readonly options: Required<StorageOptions>;
  private readonly listeners: Map<StorageEventType, Set<StorageEventListener>> = new Map();
  private initialized = false;

  constructor(options: StorageOptions = {}) {
    this.options = {
      type: StorageType.LOCAL,
      defaultExpires: 0,
      prefix: DEFAULT_PREFIX,
      encrypt: false,
      encryptKey: DEFAULT_ENCRYPT_KEY,
      autoCleanup: true,
      cleanupInterval: 0,
      ...stripUndefined(options)
    };

    normalizeExpires(this.options.defaultExpires, 'defaultExpires');
    normalizeExpires(this.options.cleanupInterval, 'cleanupInterval');
    // 构造函数不触碰 window / localStorage，SSR 下可安全实例化
  }

  /** 当前实例的作用域标识 */
  private get scopeId(): string {
    return `${this.options.type}:${this.options.prefix}`;
  }

  /**
   * 懒加载原生 Storage，并在首次访问时按配置做一次过期清理 / 启动定时清理
   */
  private resolve(): Storage | null {
    if (this.nativeStorage === undefined) {
      this.nativeStorage = resolveNativeStorage(this.options.type);
    }
    if (!this.initialized && this.nativeStorage) {
      this.initialized = true;
      this.setupCleanup();
    }
    return this.nativeStorage;
  }

  private setupCleanup(): void {
    const scope = this.scopeId;
    if (this.options.autoCleanup && !cleanedScopes.has(scope)) {
      cleanedScopes.add(scope);
      this.clearExpired();
    }
    const interval = this.options.cleanupInterval;
    if (interval > 0 && !cleanupTimers.has(scope) && typeof setInterval === 'function') {
      const timer = setInterval(() => this.clearExpired(), interval);
      // Node 下不要因为定时器阻止进程退出
      (timer as unknown as { unref?: () => void }).unref?.();
      cleanupTimers.set(scope, timer);
    }
  }

  /**
   * 生成完整的 key（带前缀）
   */
  getFullKey(key: string): string {
    return this.options.prefix + key;
  }

  /**
   * 触发事件
   */
  private emit(type: StorageEventType, data: Partial<StorageEventData> = {}): void {
    const listeners = this.listeners.get(type);
    if (!listeners || listeners.size === 0) return;
    const eventData: StorageEventData = {
      type,
      timestamp: Date.now(),
      ...data
    };
    listeners.forEach(listener => {
      try {
        listener(eventData);
      } catch (error) {
        console.error('[vue-web-super-storage] listener error:', error);
      }
    });
  }

  /**
   * 把存储的原始字符串解析为 StorageItem。
   * 支持三种格式：明文 JSON、带 encrypted 标记的信封、1.0.x 的无标记混淆串。
   */
  private decode<T>(raw: string): StorageItem<T> | null {
    const parsed = parseJson(raw);

    if (isEncryptedEnvelope(parsed)) {
      return decodeObfuscated<T>(parsed.data, this.options.encryptKey);
    }

    if (isStorageItem(parsed)) {
      return parsed as StorageItem<T>;
    }

    // 旧版（1.0.x）数据：整串就是混淆后的 Base64，无任何标记
    return decodeObfuscated<T>(raw, this.options.encryptKey);
  }

  private encode(item: StorageItem, shouldEncrypt: boolean): string {
    const json = JSON.stringify(item);
    if (!shouldEncrypt) return json;
    const envelope: EncryptedEnvelope = {
      vws: 1,
      encrypted: true,
      data: encrypt(json, this.options.encryptKey)
    };
    return JSON.stringify(envelope);
  }

  /**
   * 读取并解析一个完整 key，过期则删除。返回 null 表示不存在 / 已过期 / 无法解析。
   */
  private readItem<T>(fullKey: string, storage: Storage): StorageItem<T> | null {
    const raw = storage.getItem(fullKey);
    if (raw === null) return null;
    const item = this.decode<T>(raw);
    if (!item) return null;
    if (isExpired(item.expires)) {
      storage.removeItem(fullKey);
      this.emit('expired', { key: fullKey.substring(this.options.prefix.length) });
      return null;
    }
    return item;
  }

  /**
   * 设置存储项。expires 非法时抛出 TypeError；写入失败（配额、非浏览器环境等）返回 false。
   */
  set<T = any>(key: string, value: T, options: SetOptions = {}): boolean {
    const expires = calculateExpires(options.expires ?? this.options.defaultExpires);
    const storage = this.resolve();
    if (!storage) return false;
    try {
      const item: StorageItem<T> = {
        value,
        expires,
        created: Date.now()
      };
      const shouldEncrypt = options.encrypt ?? this.options.encrypt;
      storage.setItem(this.getFullKey(key), this.encode(item, shouldEncrypt));
      this.emit('set', { key, value });
      return true;
    } catch (error) {
      console.error('[vue-web-super-storage] set error:', error);
      return false;
    }
  }

  /**
   * 获取存储项；不存在、已过期或无法解析时返回 defaultValue ?? null
   */
  get<T = any>(key: string, options: GetOptions<T> = {}): T | null {
    const fallback = (options.defaultValue ?? null) as T | null;
    const storage = this.resolve();
    if (!storage) return fallback;
    try {
      const item = this.readItem<T>(this.getFullKey(key), storage);
      if (!item) return fallback;
      this.emit('get', { key, value: item.value });
      return item.value;
    } catch (error) {
      console.error('[vue-web-super-storage] get error:', error);
      return fallback;
    }
  }

  /**
   * 检查存储项是否存在且未过期
   */
  has(key: string): boolean {
    const storage = this.resolve();
    if (!storage) return false;
    try {
      return this.readItem(this.getFullKey(key), storage) !== null;
    } catch (error) {
      console.error('[vue-web-super-storage] has error:', error);
      return false;
    }
  }

  /**
   * 删除存储项
   */
  remove(key: string): boolean {
    const storage = this.resolve();
    if (!storage) return false;
    try {
      storage.removeItem(this.getFullKey(key));
      this.emit('remove', { key });
      return true;
    } catch (error) {
      console.error('[vue-web-super-storage] remove error:', error);
      return false;
    }
  }

  /**
   * 列出当前前缀下的所有完整 key
   */
  private fullKeys(storage: Storage): string[] {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(this.options.prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  /**
   * 清空当前前缀下的所有存储项
   */
  clear(): boolean {
    const storage = this.resolve();
    if (!storage) return false;
    try {
      this.fullKeys(storage).forEach(key => storage.removeItem(key));
      this.emit('clear');
      return true;
    } catch (error) {
      console.error('[vue-web-super-storage] clear error:', error);
      return false;
    }
  }

  /**
   * 清理当前前缀下的过期项，返回清理数量
   */
  clearExpired(): number {
    const storage = this.resolve();
    if (!storage) return 0;
    let cleared = 0;
    try {
      for (const fullKey of this.fullKeys(storage)) {
        const raw = storage.getItem(fullKey);
        if (raw === null) continue;
        const item = this.decode(raw);
        if (item && isExpired(item.expires)) {
          storage.removeItem(fullKey);
          cleared++;
        }
      }
      if (cleared > 0) {
        this.emit('expired');
      }
    } catch (error) {
      console.error('[vue-web-super-storage] clearExpired error:', error);
    }
    return cleared;
  }

  /**
   * 获取所有有效键名（不含前缀）
   */
  keys(): string[] {
    const storage = this.resolve();
    if (!storage) return [];
    const prefixLength = this.options.prefix.length;
    const keys: string[] = [];
    try {
      for (const fullKey of this.fullKeys(storage)) {
        if (this.readItem(fullKey, storage) !== null) {
          keys.push(fullKey.substring(prefixLength));
        }
      }
    } catch (error) {
      console.error('[vue-web-super-storage] keys error:', error);
    }
    return keys;
  }

  /**
   * 获取当前前缀下所有有效项（key → value）
   */
  getAll<T = any>(): Record<string, T> {
    const result: Record<string, T> = {};
    const storage = this.resolve();
    if (!storage) return result;
    const prefixLength = this.options.prefix.length;
    try {
      for (const fullKey of this.fullKeys(storage)) {
        const item = this.readItem<T>(fullKey, storage);
        if (item) {
          result[fullKey.substring(prefixLength)] = item.value;
        }
      }
    } catch (error) {
      console.error('[vue-web-super-storage] getAll error:', error);
    }
    return result;
  }

  /**
   * 获取存储统计信息（不会删除过期项）
   */
  getStats(): StorageStats {
    const stats: StorageStats = { total: 0, expired: 0, valid: 0, usedBytes: 0 };
    const storage = this.resolve();
    if (!storage) return stats;
    try {
      for (const fullKey of this.fullKeys(storage)) {
        const raw = storage.getItem(fullKey);
        if (raw === null) continue;
        stats.total++;
        stats.usedBytes += fullKey.length + raw.length;
        const item = this.decode(raw);
        if (item && isExpired(item.expires)) {
          stats.expired++;
        } else {
          stats.valid++;
        }
      }
    } catch (error) {
      console.error('[vue-web-super-storage] getStats error:', error);
    }
    return stats;
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
    this.listeners.get(type)?.delete(listener);
  }

  /**
   * 停止本实例作用域内的定时清理器（如果有）
   */
  destroy(): void {
    const timer = cleanupTimers.get(this.scopeId);
    if (timer !== undefined) {
      clearInterval(timer);
      cleanupTimers.delete(this.scopeId);
    }
    this.listeners.clear();
  }

  /**
   * 获取原生 Storage 对象；非浏览器环境返回 null
   */
  getStorage(): Storage | null {
    return this.resolve();
  }

  /**
   * 获取配置选项
   */
  getOptions(): Readonly<Required<StorageOptions>> {
    return { ...this.options };
  }
}

/**
 * 先按新方案（UTF-8 字节 XOR）解码，解不出合法 StorageItem 时再按旧方案解码
 */
function decodeObfuscated<T>(data: string, key: string): StorageItem<T> | null {
  const attempts: Array<() => string> = [() => decryptStrict(data, key), () => decryptLegacy(data, key)];
  for (const attempt of attempts) {
    try {
      const item = parseJson(attempt());
      if (isStorageItem(item)) return item as StorageItem<T>;
    } catch {
      // 尝试下一种方案
    }
  }
  return null;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  (Object.keys(obj) as (keyof T)[]).forEach(k => {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}

/** 仅供测试：重置「首次清理」与定时器登记 */
export function __resetCleanupRegistry(): void {
  cleanedScopes.clear();
  cleanupTimers.forEach(timer => clearInterval(timer));
  cleanupTimers.clear();
}
