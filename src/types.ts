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
 * Storage 配置选项
 */
export interface StorageOptions {
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
}

/**
 * 获取存储项的选项
 */
export interface GetOptions<T = any> {
  /** 默认值，当存储项不存在或已过期时返回 */
  defaultValue?: T;
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
}
