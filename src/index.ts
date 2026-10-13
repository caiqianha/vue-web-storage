/**
 * vue-web-super-storage
 * 轻量、类型安全、支持过期时间的 Vue 3 Web Storage 封装库
 * @author caiqianha
 */

// 类型定义
export type {
  StorageItem,
  EncryptedEnvelope,
  StorageOptions,
  UseStorageOptions,
  SetOptions,
  GetOptions,
  StorageStats,
  StorageEventType,
  StorageEventData,
  StorageEventListener,
  // 1.2.0: schema / 版本迁移
  StandardSchemaV1,
  StandardSchemaIssue,
  StandardSchemaResult,
  SchemaValidator,
  StorageSchema,
  MigrateFn,
  OnInvalidHook,
  SchemaOptions,
  // 1.2.0: IndexedDB
  IndexedDBOptions,
  UseIndexedDBOptions,
  IndexedDBBroadcastMessage
} from './types';

export { StorageType } from './types';

// 核心类
export {
  WebStorage,
  DEFAULT_PREFIX,
  DEFAULT_ENCRYPT_KEY,
  isBrowser,
  resolveNativeStorage,
  type ResolvedStorageOptions
} from './storage';

// IndexedDB 适配器
export {
  IndexedDBStorage,
  createIndexedDBStorage,
  hasIndexedDB,
  hasBroadcastChannel,
  indexedDBChannelName,
  DEFAULT_DB_NAME,
  DEFAULT_STORE_NAME,
  type ResolvedIndexedDBOptions
} from './indexeddb';

// schema 校验 / 迁移
export { StorageValidationError, validateSync, validateAsync, runMigrations } from './schema';

// 工具函数
export {
  encrypt,
  decrypt,
  decryptLegacy,
  isExpired,
  calculateExpires,
  normalizeExpires,
  serialize,
  deserialize,
  getStorageSize,
  formatBytes,
  deepClone
} from './utils';

// 组合式 API
export {
  useStorage,
  useLocalStorage,
  useSessionStorage,
  useIndexedDB,
  StorageState,
  createStorageState,
  useBatchStorage,
  type UseStorageReturn,
  type UseIndexedDBReturn
} from './composables';

// Vue 插件
export {
  VueWebStoragePlugin,
  createStorageApi,
  useWebStorage,
  WEB_STORAGE_KEY,
  LOCAL_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  type VueWebStorageOptions,
  type StorageApi
} from './plugin';

export { VueWebStoragePlugin as default } from './plugin';

import { WebStorage } from './storage';
import { StorageType } from './types';

/**
 * 便捷实例。构造函数不会触碰 window / localStorage，
 * 真正的访问延迟到第一次调用方法时，因此在 SSR 下 import 是安全的。
 */
export const local = new WebStorage({ type: StorageType.LOCAL });
export const session = new WebStorage({ type: StorageType.SESSION });

/**
 * @deprecated 与全局 localStorage 同名，容易混淆；请改用 `local`。保留以兼容 1.0.x。
 */
export const localStorage = local;
/**
 * @deprecated 与全局 sessionStorage 同名，容易混淆；请改用 `session`。保留以兼容 1.0.x。
 */
export const sessionStorage = session;

/** 包版本号，构建时从 package.json 注入 */
export const version: string = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';
