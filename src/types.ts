/**
 * Storage 类型枚举
 */
export enum StorageType {
  LOCAL = 'localStorage',
  SESSION = 'sessionStorage'
}

/**
 * 存储项的接口
 */
export interface StorageItem<T = any> {
  /** 存储的值 */
  value: T;
  /** 过期时间戳（毫秒），如果为 null 则永不过期 */
  expires: number | null;
  /** 创建时间戳 */
  created: number;
}

/**
 * Storage 配置选项
 */
export interface StorageOptions {
  /** Storage 类型，默认为 localStorage */
  type?: StorageType;
  /** 默认过期时间（毫秒），如果不设置则永不过期 */
  defaultExpires?: number;
  /** key 前缀，用于避免命名冲突 */
  prefix?: string;
  /** 是否启用加密存储 */
  encrypt?: boolean;
  /** 加密密钥 */
  encryptKey?: string;
}

/**
 * 设置存储项的选项
 */
export interface SetOptions {
  /** 过期时间（毫秒） */
  expires?: number;
  /** 是否加密此项 */
  encrypt?: boolean;
}

/**
 * 获取存储项的选项
 */
export interface GetOptions {
  /** 默认值，当存储项不存在或已过期时返回 */
  defaultValue?: any;
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
  /** 使用的存储空间（字节） */
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
