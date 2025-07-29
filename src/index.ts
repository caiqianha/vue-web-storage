/**
 * Vue Web Storage - 轻量、支持类型、支持过期时间的 Web Storage 封装库
 * @author caiqianha
 * @version 1.0.0
 */

// 导出类型定义
export type {
  StorageItem,
  StorageOptions,
  SetOptions,
  GetOptions,
  StorageStats,
  StorageEventType,
  StorageEventData,
  StorageEventListener
} from './types';

export { StorageType } from './types';

// 导出核心类
export { WebStorage } from './storage';

// 导出工具函数
export {
  encrypt,
  decrypt,
  isExpired,
  calculateExpires,
  serialize,
  deserialize,
  getStorageSize,
  formatBytes,
  deepClone
} from './utils';

// 导出组合式 API
export {
  useStorage,
  useLocalStorage,
  useSessionStorage,
  StorageState,
  createStorageState,
  useBatchStorage
} from './composables';

// 导出 Vue 插件
export {
  VueWebStoragePlugin,
  type VueWebStorageOptions
} from './plugin';

// 默认导出插件
export { VueWebStoragePlugin as default } from './plugin';

// 创建便捷的实例
import { WebStorage } from './storage';
import { StorageType } from './types';

export const localStorage = new WebStorage({
  type: StorageType.LOCAL,
  prefix: 'vue-local-'
});

export const sessionStorage = new WebStorage({
  type: StorageType.SESSION,
  prefix: 'vue-session-'
});

// 版本信息
export const version = '1.0.0';
