/**
 * Storage 类型枚举
 */
export enum StorageType {
  LOCAL = 'localStorage',
  SESSION = 'sessionStorage'
}

/**
 * 存储项（写入 storage 的明文信封）
 */
export interface StorageItem<T = any> {
  /** 存储的值 */
  value: T;
  /** 过期时间戳（毫秒），null 表示永不过期 */
  expires: number | null;
  /** 创建时间戳 */
  created: number;
  /**
   * 数据结构版本（1.2.0 起）。只有实例配置了 `version` 时才会写入；
   * 1.1.0 及更早写出的数据没有该字段，读取时按版本 0 处理。
   */
  v?: number;
}

/**
 * 加密项的外层信封。真正的 StorageItem 被序列化并混淆后放在 data 中，
 * encrypted 标记让读取方无需依赖实例级 encrypt 配置即可识别。
 */
export interface EncryptedEnvelope {
  /** 信封格式版本 */
  vws: 1;
  encrypted: true;
  /** 混淆后的 Base64 字符串 */
  data: string;
}


/**
 * Standard Schema（https://standardschema.dev）接口的最小子集。
 * zod 3.24+ / valibot / arktype 等库的 schema 对象都满足该形状。
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
}

export type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> };

/**
 * 校验函数：返回（可能被规范化过的）值，或抛出异常表示不合法
 */
export type SchemaValidator<T = any> = (value: unknown) => T;

/**
 * 可用于 `schema` 选项的两种形式：Standard Schema 对象，或普通校验函数
 */
export type StorageSchema<T = any> = StandardSchemaV1<unknown, T> | SchemaValidator<T>;

/**
 * 单步迁移函数：把 `fromVersion` 版本的数据升级到下一个版本
 */
export type MigrateFn<T = any> = (oldValue: any, fromVersion: number) => T;

/**
 * 读取到无法通过校验（或迁移抛错）的数据时的回调
 */
export type OnInvalidHook = (key: string, error: unknown) => void;

/**
 * schema 校验与版本迁移选项（WebStorage / IndexedDBStorage / 组合式 API 共用）
 */
export interface SchemaOptions<T = any> {
  /**
   * 读写校验。读取时校验失败回退到默认值并触发 `onInvalid`；
   * 写入时校验失败抛出 `StorageValidationError`（同步 API）或 reject（IndexedDB）。
   * Standard Schema 的 `validate` 若返回 Promise，只有 IndexedDB 适配器支持。
   */
  schema?: StorageSchema<T>;
  /**
   * 当前数据结构版本（正整数）。设置后写入的信封带 `v` 字段；
   * 读取到 `v` 小于该值（无 `v` 视为 0）的数据时先迁移再校验，迁移结果会写回存储。
   */
  version?: number;
  /**
   * 一步到位的迁移函数：`(oldValue, oldVersion) => 当前版本的值`。
   * 与 `migrations` 二选一，两者都给时优先 `migrations`。
   */
  migrate?: (oldValue: any, oldVersion: number) => T;
  /**
   * 链式迁移：`migrations[n]` 把 n-1 版本的数据升级到 n 版本，
   * 从 `oldVersion + 1` 依次执行到 `version`，缺失的步骤跳过。
   */
  migrations?: Record<number, MigrateFn>;
  /**
   * 读取到无效数据（校验失败 / 迁移抛错）时的回调，默认在非 production 环境 `console.warn`。
   */
  onInvalid?: OnInvalidHook;
}

/**
 * Storage 配置选项
 */
export interface StorageOptions extends SchemaOptions {
  /** Storage 类型，默认为 localStorage */
  type?: StorageType;
  /**
   * 默认过期时间（毫秒）。0 或不设置表示永不过期；
   * 负数、NaN、Infinity 会抛出 TypeError。
   */
  defaultExpires?: number;
  /** key 前缀，用于隔离命名空间，默认 'vue-storage-' */
  prefix?: string;
  /**
   * 是否默认对每一项做混淆存储（XOR + Base64，并非密码学加密，
   * 只能防止直接在 DevTools 里看到明文）
   */
  encrypt?: boolean;
  /** 混淆用的密钥 */
  encryptKey?: string;
  /**
   * 是否在首次访问 storage 时自动清理一次过期数据。
   * 同一 (type, prefix) 在一次页面生命周期内只会清理一次，默认 true。
   */
  autoCleanup?: boolean;
  /**
   * 定期清理过期数据的间隔（毫秒）。0 或不设置表示不定期清理。
   * 同一 (type, prefix) 只会存在一个定时器。
   */
  cleanupInterval?: number;
}

/**
 * 设置存储项的选项
 */
export interface SetOptions {
  /**
   * 过期时间（毫秒）。0 表示永不过期；
   * 负数、NaN、Infinity 会抛出 TypeError。
   */
  expires?: number;
  /** 是否混淆此项（覆盖实例级 encrypt 配置） */
  encrypt?: boolean;
  /** 仅对本次写入生效的校验 schema（覆盖实例级 schema） */
  schema?: StorageSchema;
}

/**
 * 获取存储项的选项
 */
export interface GetOptions<T = any> {
  /** 默认值，当存储项不存在、已过期或校验失败时返回 */
  defaultValue?: T;
  /** 仅对本次读取生效的校验 schema（覆盖实例级 schema） */
  schema?: StorageSchema<T>;
}

/**
 * Storage 统计信息
 */
export interface StorageStats {
  /** 总项目数 */
  total: number;
  /** 已过期项目数 */
  expired: number;
  /** 有效项目数 */
  valid: number;
  /** 使用的存储空间（UTF-16 码元数，近似字节数） */
  usedBytes: number;
}

/**
 * Storage 事件类型
 */
export type StorageEventType = 'set' | 'get' | 'remove' | 'clear' | 'expired';

/**
 * Storage 事件数据
 */
export interface StorageEventData {
  type: StorageEventType;
  key?: string;
  value?: any;
  timestamp: number;
}

/**
 * Storage 事件监听器
 */
export type StorageEventListener = (data: StorageEventData) => void;

/**
 * 组合式 API 的额外选项
 */
export interface UseStorageOptions extends StorageOptions {
  /**
   * 是否监听其他标签页对同一 key 的修改（window 'storage' 事件）并同步到 ref，
   * 默认 true。
   */
  syncAcrossTabs?: boolean;
  /**
   * 为 true 时 ref 初始为默认值，在组件 `onMounted` 后才从 storage 读取。
   * 用于 SSR 场景避免注水不匹配（服务端与客户端首屏渲染同一个默认值）。
   * 在组件 setup 之外调用时等同于立即读取。默认 false。
   */
  initOnMounted?: boolean;
}

/**
 * IndexedDB 适配器配置
 */
export interface IndexedDBOptions<T = any> extends SchemaOptions<T> {
  /** 数据库名，默认 'vue-web-super-storage' */
  dbName?: string;
  /** 对象仓库名，默认 'keyval' */
  storeName?: string;
  /** key 前缀，默认 'vue-storage-' */
  prefix?: string;
  /** 默认过期时间（毫秒），0 或不设置表示永不过期；非法值抛 TypeError */
  expires?: number;
  /** `expires` 的别名，与 WebStorage 选项命名保持一致 */
  defaultExpires?: number;
  /** 是否默认混淆每一项（XOR + Base64，非加密） */
  encrypt?: boolean;
  /** 混淆用的密钥 */
  encryptKey?: string;
  /**
   * 写入后是否通过 BroadcastChannel 通知其他标签页，默认 true；
   * 环境不支持 BroadcastChannel 时自动跳过。
   */
  broadcast?: boolean;
}

/**
 * useIndexedDB 的额外选项
 */
export interface UseIndexedDBOptions<T = any> extends IndexedDBOptions<T> {
  /** 是否监听其他标签页（BroadcastChannel）对同一 key 的修改并刷新 ref，默认 true */
  syncAcrossTabs?: boolean;
  /** ref 变化后延迟多少毫秒合并写入 IndexedDB，默认 0（下一个宏任务） */
  debounce?: number;
  /** 写入失败时的回调；不提供时 `console.error` */
  onError?: (error: unknown) => void;
}

/**
 * IndexedDB 跨标签页广播消息
 */
export interface IndexedDBBroadcastMessage {
  type: 'set' | 'remove' | 'clear';
  key?: string;
}
