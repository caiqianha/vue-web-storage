import { App } from 'vue';
import { WebStorage } from './storage';
import { StorageOptions, StorageType } from './types';

/**
 * Vue 插件选项
 */
export interface VueWebStorageOptions {
  /** localStorage 配置 */
  localStorage?: StorageOptions;
  /** sessionStorage 配置 */
  sessionStorage?: StorageOptions;
  /** 全局实例名称 */
  globalName?: string;
}

/**
 * Vue 插件
 */
export const VueWebStoragePlugin = {
  install(app: App, options: VueWebStorageOptions = {}) {
    const {
      localStorage: localOptions = {},
      sessionStorage: sessionOptions = {},
      globalName = '$storage'
    } = options;

    // 创建 localStorage 实例
    const localStorage = new WebStorage({
      type: StorageType.LOCAL,
      prefix: 'vue-local-',
      ...localOptions
    });

    // 创建 sessionStorage 实例
    const sessionStorage = new WebStorage({
      type: StorageType.SESSION,
      prefix: 'vue-session-',
      ...sessionOptions
    });

    // 全局存储实例
    const storage = {
      local: localStorage,
      session: sessionStorage,
      
      // 便捷方法
      setLocal: localStorage.set.bind(localStorage),
      getLocal: localStorage.get.bind(localStorage),
      removeLocal: localStorage.remove.bind(localStorage),
      clearLocal: localStorage.clear.bind(localStorage),
      
      setSession: sessionStorage.set.bind(sessionStorage),
      getSession: sessionStorage.get.bind(sessionStorage),
      removeSession: sessionStorage.remove.bind(sessionStorage),
      clearSession: sessionStorage.clear.bind(sessionStorage),
      
      // 通用方法
      set: localStorage.set.bind(localStorage),
      get: localStorage.get.bind(localStorage),
      remove: localStorage.remove.bind(localStorage),
      clear: localStorage.clear.bind(localStorage),
      has: localStorage.has.bind(localStorage),
      keys: localStorage.keys.bind(localStorage),
      clearExpired: localStorage.clearExpired.bind(localStorage),
      getStats: localStorage.getStats.bind(localStorage)
    };

    // 注册全局属性
    app.config.globalProperties[globalName] = storage;
    
    // 提供依赖注入
    app.provide('webStorage', storage);
    app.provide('localStorage', localStorage);
    app.provide('sessionStorage', sessionStorage);
  }
};

/**
 * 声明全局类型
 */
declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $storage: {
      local: WebStorage;
      session: WebStorage;
      setLocal: <T>(key: string, value: T, options?: any) => boolean;
      getLocal: <T>(key: string, options?: any) => T | null;
      removeLocal: (key: string) => boolean;
      clearLocal: () => boolean;
      setSession: <T>(key: string, value: T, options?: any) => boolean;
      getSession: <T>(key: string, options?: any) => T | null;
      removeSession: (key: string) => boolean;
      clearSession: () => boolean;
      set: <T>(key: string, value: T, options?: any) => boolean;
      get: <T>(key: string, options?: any) => T | null;
      remove: (key: string) => boolean;
      clear: () => boolean;
      has: (key: string) => boolean;
      keys: () => string[];
      clearExpired: () => number;
      getStats: () => any;
    };
  }
}

export default VueWebStoragePlugin;
