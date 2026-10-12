import { App, InjectionKey, inject } from 'vue';
import { WebStorage, DEFAULT_PREFIX } from './storage';
import { StorageOptions, StorageType, SetOptions, GetOptions, StorageStats } from './types';

/**
 * Vue 插件选项
 */
export interface VueWebStorageOptions {
  /** localStorage 实例配置 */
  localStorage?: Omit<StorageOptions, 'type'>;
  /** sessionStorage 实例配置 */
  sessionStorage?: Omit<StorageOptions, 'type'>;
  /** 挂到 globalProperties 上的名字，默认 '$storage' */
  globalName?: string;
}

/**
 * 插件注入的全局 API（即 this.$storage / inject(WEB_STORAGE_KEY)）
 */
export interface StorageApi {
  local: WebStorage;
  session: WebStorage;

  setLocal: <T>(key: string, value: T, options?: SetOptions) => boolean;
  getLocal: <T>(key: string, options?: GetOptions<T>) => T | null;
  removeLocal: (key: string) => boolean;
  clearLocal: () => boolean;

  setSession: <T>(key: string, value: T, options?: SetOptions) => boolean;
  getSession: <T>(key: string, options?: GetOptions<T>) => T | null;
  removeSession: (key: string) => boolean;
  clearSession: () => boolean;

  /** 以下通用方法默认操作 localStorage 实例 */
  set: <T>(key: string, value: T, options?: SetOptions) => boolean;
  get: <T>(key: string, options?: GetOptions<T>) => T | null;
  remove: (key: string) => boolean;
  clear: () => boolean;
  has: (key: string) => boolean;
  keys: () => string[];
  clearExpired: () => number;
  getStats: () => StorageStats;
}

/** inject 用的类型安全 key：完整 API */
export const WEB_STORAGE_KEY: InjectionKey<StorageApi> = Symbol('vue-web-super-storage:api');
/** inject 用的类型安全 key：localStorage 实例 */
export const LOCAL_STORAGE_KEY: InjectionKey<WebStorage> = Symbol('vue-web-super-storage:local');
/** inject 用的类型安全 key：sessionStorage 实例 */
export const SESSION_STORAGE_KEY: InjectionKey<WebStorage> = Symbol('vue-web-super-storage:session');

/**
 * 根据两个实例组装插件 API
 */
export function createStorageApi(local: WebStorage, session: WebStorage): StorageApi {
  return {
    local,
    session,

    setLocal: (key, value, options) => local.set(key, value, options),
    getLocal: (key, options) => local.get(key, options),
    removeLocal: key => local.remove(key),
    clearLocal: () => local.clear(),

    setSession: (key, value, options) => session.set(key, value, options),
    getSession: (key, options) => session.get(key, options),
    removeSession: key => session.remove(key),
    clearSession: () => session.clear(),

    set: (key, value, options) => local.set(key, value, options),
    get: (key, options) => local.get(key, options),
    remove: key => local.remove(key),
    clear: () => local.clear(),
    has: key => local.has(key),
    keys: () => local.keys(),
    clearExpired: () => local.clearExpired(),
    getStats: () => local.getStats()
  };
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

    const local = new WebStorage({
      prefix: DEFAULT_PREFIX,
      ...localOptions,
      type: StorageType.LOCAL
    });

    const session = new WebStorage({
      prefix: DEFAULT_PREFIX,
      ...sessionOptions,
      type: StorageType.SESSION
    });

    const api = createStorageApi(local, session);

    app.config.globalProperties[globalName] = api;

    // Symbol key（类型安全）
    app.provide(WEB_STORAGE_KEY, api);
    app.provide(LOCAL_STORAGE_KEY, local);
    app.provide(SESSION_STORAGE_KEY, session);
    // 1.0.x 的字符串 key，保持兼容
    app.provide('webStorage', api);
    app.provide('localStorage', local);
    app.provide('sessionStorage', session);
  }
};

/**
 * 在 setup 中获取插件注入的 API；未安装插件时抛出错误
 */
export function useWebStorage(): StorageApi {
  const api = inject(WEB_STORAGE_KEY, null) ?? inject<StorageApi | null>('webStorage', null);
  if (!api) {
    throw new Error(
      '[vue-web-super-storage] useWebStorage() called before app.use(VueWebStoragePlugin), or outside setup()'
    );
  }
  return api;
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $storage: StorageApi;
  }
}

export default VueWebStoragePlugin;
