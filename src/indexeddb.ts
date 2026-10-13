import {
  IndexedDBOptions,
  IndexedDBBroadcastMessage,
  SchemaOptions,
  SetOptions,
  GetOptions,
  StorageItem,
  StorageEventType,
  StorageEventData,
  StorageEventListener
} from './types';
import { isExpired, calculateExpires, normalizeExpires } from './utils';
import { decodeItem, encodeItem, buildItem, itemVersion } from './codec';
import { normalizeVersion, prepareReadAsync, validateAsync } from './schema';
import { DEFAULT_PREFIX, DEFAULT_ENCRYPT_KEY } from './storage';

export const DEFAULT_DB_NAME = 'vue-web-super-storage';
export const DEFAULT_STORE_NAME = 'keyval';

/** 实例内部使用的已解析配置 */
export type ResolvedIndexedDBOptions = Required<
  Omit<IndexedDBOptions, keyof SchemaOptions | 'expires' | 'defaultExpires'>
> &
  SchemaOptions & { defaultExpires: number };

/** 当前环境是否提供 IndexedDB */
export function hasIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/** 当前环境是否提供 BroadcastChannel */
export function hasBroadcastChannel(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

/** 跨标签页广播使用的频道名，由 dbName + prefix 派生 */
export function indexedDBChannelName(dbName: string, prefix: string): string {
  return `vue-web-super-storage:${dbName}:${prefix}`;
}

let warnedUnavailable = false;
function warnUnavailable(): void {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.warn(
    '[vue-web-super-storage] IndexedDB is not available in this environment (SSR or unsupported browser); all IndexedDB operations are no-ops'
  );
}

/** 仅供测试：重置「IndexedDB 不可用」的一次性警告 */
export function __resetIndexedDBWarning(): void {
  warnedUnavailable = false;
}

// ---------------------------------------------------------------------------
// 极简的 Promise 包装（不依赖 idb）
// ---------------------------------------------------------------------------

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openDatabase(dbName: string, version: number | undefined, storeName: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(dbName) : indexedDB.open(dbName, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('[vue-web-super-storage] IndexedDB open blocked by another connection'));
  });
}

/**
 * 打开数据库并确保对象仓库存在；库已存在但缺少仓库时自动升级版本号创建
 */
async function openWithStore(dbName: string, storeName: string): Promise<IDBDatabase> {
  let db = await openDatabase(dbName, undefined, storeName);
  if (!db.objectStoreNames.contains(storeName)) {
    const nextVersion = db.version + 1;
    db.close();
    db = await openDatabase(dbName, nextVersion, storeName);
  }
  return db;
}

// ---------------------------------------------------------------------------
// IndexedDBStorage
// ---------------------------------------------------------------------------

/**
 * IndexedDB 适配器。API 与 WebStorage 一一对应，但全部返回 Promise。
 * 落盘的字符串格式（TTL 信封 / 混淆信封 / 版本号）与 WebStorage 完全一致。
 */
export class IndexedDBStorage {
  private readonly options: ResolvedIndexedDBOptions;
  private readonly listeners: Map<StorageEventType, Set<StorageEventListener>> = new Map();
  private dbPromise: Promise<IDBDatabase> | undefined;
  private channel: BroadcastChannel | null | undefined;
  private readonly subscribers = new Set<(message: IndexedDBBroadcastMessage) => void>();
  private channelHandler: ((event: MessageEvent) => void) | undefined;

  constructor(options: IndexedDBOptions = {}) {
    const { expires, defaultExpires, ...rest } = options;
    this.options = {
      dbName: DEFAULT_DB_NAME,
      storeName: DEFAULT_STORE_NAME,
      prefix: DEFAULT_PREFIX,
      encrypt: false,
      encryptKey: DEFAULT_ENCRYPT_KEY,
      broadcast: true,
      ...stripUndefined(rest),
      defaultExpires: defaultExpires ?? expires ?? 0
    };
    normalizeExpires(this.options.defaultExpires, 'expires');
    normalizeVersion(this.options.version);
    // 构造函数不触碰 indexedDB，SSR 下可安全实例化
  }

  /** 跨标签页广播使用的频道名 */
  get channelName(): string {
    return indexedDBChannelName(this.options.dbName, this.options.prefix);
  }

  /** 当前环境是否可用 */
  isAvailable(): boolean {
    return hasIndexedDB();
  }

  /** 生成完整的 key（带前缀） */
  getFullKey(key: string): string {
    return this.options.prefix + key;
  }

  /** 获取配置选项 */
  getOptions(): Readonly<ResolvedIndexedDBOptions> {
    return { ...this.options };
  }

  // ---- 内部工具 ----------------------------------------------------------

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openWithStore(this.options.dbName, this.options.storeName).then(db => {
        // 其他标签页升级版本时主动断开，下次访问重新打开
        db.onversionchange = () => {
          db.close();
          this.dbPromise = undefined;
        };
        return db;
      });
      this.dbPromise.catch(() => {
        this.dbPromise = undefined;
      });
    }
    return this.dbPromise;
  }

  private async store(mode: IDBTransactionMode): Promise<{ store: IDBObjectStore; done: Promise<void> }> {
    const db = await this.db();
    const tx = db.transaction(this.options.storeName, mode);
    return { store: tx.objectStore(this.options.storeName), done: transactionDone(tx) };
  }

  private async readRaw(fullKey: string): Promise<string | null> {
    const { store } = await this.store('readonly');
    const raw = await requestToPromise(store.get(fullKey) as IDBRequest<unknown>);
    return typeof raw === 'string' ? raw : null;
  }

  private async writeRaw(fullKey: string, raw: string): Promise<void> {
    const { store, done } = await this.store('readwrite');
    store.put(raw, fullKey);
    await done;
  }

  private async deleteRaw(fullKeys: string[]): Promise<void> {
    if (fullKeys.length === 0) return;
    const { store, done } = await this.store('readwrite');
    fullKeys.forEach(fullKey => store.delete(fullKey));
    await done;
  }

  /** 读取当前前缀下所有 (fullKey, raw) */
  private async readAllRaw(): Promise<Array<[string, string]>> {
    const { store } = await this.store('readonly');
    const [keys, values] = await Promise.all([
      requestToPromise(store.getAllKeys()),
      requestToPromise(store.getAll() as IDBRequest<unknown[]>)
    ]);
    const prefix = this.options.prefix;
    const out: Array<[string, string]> = [];
    keys.forEach((k, i) => {
      const v = values[i];
      if (typeof k === 'string' && k.startsWith(prefix) && typeof v === 'string') {
        out.push([k, v]);
      }
    });
    return out;
  }

  private emit(type: StorageEventType, data: Partial<StorageEventData> = {}): void {
    const listeners = this.listeners.get(type);
    if (!listeners || listeners.size === 0) return;
    const eventData: StorageEventData = { type, timestamp: Date.now(), ...data };
    listeners.forEach(listener => {
      try {
        listener(eventData);
      } catch (error) {
        console.error('[vue-web-super-storage] listener error:', error);
      }
    });
  }

  private getChannel(): BroadcastChannel | null {
    if (this.channel === undefined) {
      this.channel = this.options.broadcast && hasBroadcastChannel() ? new BroadcastChannel(this.channelName) : null;
    }
    return this.channel;
  }

  private broadcast(message: IndexedDBBroadcastMessage): void {
    try {
      this.getChannel()?.postMessage(message);
    } catch (error) {
      console.error('[vue-web-super-storage] broadcast error:', error);
    }
  }

  /**
   * 解析一条原始数据：过期则删除；版本落后则迁移并写回；配置了 schema 则校验
   */
  private async processRaw<T>(
    fullKey: string,
    raw: string,
    schemaOverride?: GetOptions<T>['schema']
  ): Promise<StorageItem<T> | null> {
    const decoded = decodeItem<T>(raw, this.options.encryptKey);
    if (!decoded) return null;
    const { item, encrypted } = decoded;
    const key = fullKey.substring(this.options.prefix.length);
    if (isExpired(item.expires)) {
      await this.deleteRaw([fullKey]);
      this.emit('expired', { key });
      return null;
    }

    const hasPipeline = schemaOverride || this.options.schema || this.options.version !== undefined;
    if (!hasPipeline) return item;

    const result = await prepareReadAsync<T>(item.value, itemVersion(item), key, this.options, schemaOverride);
    if (!result.ok) return null;

    const processed: StorageItem<T> = { ...item, value: result.value };
    if (result.migrated) {
      processed.v = this.options.version;
      try {
        await this.writeRaw(fullKey, encodeItem(processed, encrypted, this.options.encryptKey));
      } catch (error) {
        console.error('[vue-web-super-storage] failed to persist migrated value:', error);
      }
    }
    return processed;
  }

  // ---- 公开 API ----------------------------------------------------------

  /**
   * 写入。expires 非法时 reject TypeError；schema 校验失败时 reject StorageValidationError；
   * IndexedDB 不可用或写入失败时 resolve false。
   */
  async set<T = any>(key: string, value: T, options: SetOptions = {}): Promise<boolean> {
    const expires = calculateExpires(options.expires ?? this.options.defaultExpires);
    const schema = options.schema ?? this.options.schema;
    const toStore = schema ? await validateAsync<T>(schema, value, key) : value;
    if (!hasIndexedDB()) {
      warnUnavailable();
      return false;
    }
    try {
      const item = buildItem(toStore, expires, this.options.version);
      const shouldEncrypt = options.encrypt ?? this.options.encrypt;
      await this.writeRaw(this.getFullKey(key), encodeItem(item, shouldEncrypt, this.options.encryptKey));
      this.emit('set', { key, value: toStore });
      this.broadcast({ type: 'set', key });
      return true;
    } catch (error) {
      console.error('[vue-web-super-storage] IndexedDB set error:', error);
      return false;
    }
  }

  /**
   * 读取；不存在、已过期、无法解析或校验失败时 resolve defaultValue ?? null
   */
  async get<T = any>(key: string, options: GetOptions<T> = {}): Promise<T | null> {
    const fallback = (options.defaultValue ?? null) as T | null;
    if (!hasIndexedDB()) {
      warnUnavailable();
      return fallback;
    }
    try {
      const fullKey = this.getFullKey(key);
      const raw = await this.readRaw(fullKey);
      if (raw === null) return fallback;
      const item = await this.processRaw<T>(fullKey, raw, options.schema);
      if (!item) return fallback;
      this.emit('get', { key, value: item.value });
      return item.value;
    } catch (error) {
      console.error('[vue-web-super-storage] IndexedDB get error:', error);
      return fallback;
    }
  }

  /** 是否存在且未过期（配置了 schema 时还需通过校验） */
  async has(key: string): Promise<boolean> {
    if (!hasIndexedDB()) {
      warnUnavailable();
      return false;
    }
    try {
      const fullKey = this.getFullKey(key);
      const raw = await this.readRaw(fullKey);
      if (raw === null) return false;
      return (await this.processRaw(fullKey, raw)) !== null;
    } catch (error) {
      console.error('[vue-web-super-storage] IndexedDB has error:', error);
      return false;
    }
  }

  /** 删除 */
  async remove(key: string): Promise<boolean> {
    if (!hasIndexedDB()) {
      warnUnavailable();
      return false;
    }
    try {
      await this.deleteRaw([this.getFullKey(key)]);
      this.emit('remove', { key });
      this.broadcast({ type: 'remove', key });
      return true;
    } catch (error) {
      console.error('[vue-web-super-storage] IndexedDB remove error:', error);
      return false;
    }
  }

  /** 清空当前前缀下的所有项 */
  async clear(): Promise<boolean> {
    if (!hasIndexedDB()) {
      warnUnavailable();
      return false;
    }
    try {
      const entries = await this.readAllRaw();
      await this.deleteRaw(entries.map(([fullKey]) => fullKey));
      this.emit('clear');
      this.broadcast({ type: 'clear' });
      return true;
    } catch (error) {
      console.error('[vue-web-super-storage] IndexedDB clear error:', error);
      return false;
    }
  }

  /** 清理过期项，resolve 清理数量 */
  async clearExpired(): Promise<number> {
    if (!hasIndexedDB()) {
      warnUnavailable();
      return 0;
    }
    try {
      const expired: string[] = [];
      for (const [fullKey, raw] of await this.readAllRaw()) {
        const decoded = decodeItem(raw, this.options.encryptKey);
        if (decoded && isExpired(decoded.item.expires)) expired.push(fullKey);
      }
      await this.deleteRaw(expired);
      if (expired.length > 0) this.emit('expired');
      return expired.length;
    } catch (error) {
      console.error('[vue-web-super-storage] IndexedDB clearExpired error:', error);
      return 0;
    }
  }

  /** 所有有效键名（不含前缀） */
  async keys(): Promise<string[]> {
    return Object.keys(await this.getAll());
  }

  /** 当前前缀下所有有效项（key → value） */
  async getAll<T = any>(): Promise<Record<string, T>> {
    const result: Record<string, T> = {};
    if (!hasIndexedDB()) {
      warnUnavailable();
      return result;
    }
    try {
      const prefixLength = this.options.prefix.length;
      for (const [fullKey, raw] of await this.readAllRaw()) {
        const item = await this.processRaw<T>(fullKey, raw);
        if (item) result[fullKey.substring(prefixLength)] = item.value;
      }
    } catch (error) {
      console.error('[vue-web-super-storage] IndexedDB getAll error:', error);
    }
    return result;
  }

  /** 添加事件监听器 */
  on(type: StorageEventType, listener: StorageEventListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  /** 移除事件监听器 */
  off(type: StorageEventType, listener: StorageEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  /**
   * 订阅其他标签页（或同页其他实例）通过 BroadcastChannel 发来的写入通知。
   * 环境不支持 BroadcastChannel 时返回的取消函数为空操作。
   */
  subscribe(listener: (message: IndexedDBBroadcastMessage) => void): () => void {
    const channel = this.getChannel();
    if (!channel) return () => {};
    this.subscribers.add(listener);
    if (!this.channelHandler) {
      this.channelHandler = (event: MessageEvent) => {
        const message = event.data as IndexedDBBroadcastMessage;
        if (!message || typeof message !== 'object') return;
        this.subscribers.forEach(fn => {
          try {
            fn(message);
          } catch (error) {
            console.error('[vue-web-super-storage] subscriber error:', error);
          }
        });
      };
      channel.addEventListener('message', this.channelHandler);
    }
    return () => {
      this.subscribers.delete(listener);
    };
  }

  /** 关闭数据库连接与广播频道 */
  close(): void {
    if (this.channel && this.channelHandler) {
      this.channel.removeEventListener('message', this.channelHandler);
    }
    this.channel?.close();
    this.channel = undefined;
    this.channelHandler = undefined;
    this.subscribers.clear();
    this.listeners.clear();
    const pending = this.dbPromise;
    this.dbPromise = undefined;
    pending?.then(db => db.close()).catch(() => {});
  }

  /** `close()` 的别名，与 WebStorage 保持一致 */
  destroy(): void {
    this.close();
  }
}

/**
 * 创建 IndexedDB 适配器实例
 */
export function createIndexedDBStorage<T = any>(options: IndexedDBOptions<T> = {}): IndexedDBStorage {
  return new IndexedDBStorage(options);
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  (Object.keys(obj) as (keyof T)[]).forEach(k => {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}
