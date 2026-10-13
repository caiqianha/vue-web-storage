import { defineNuxtModule, addPluginTemplate, addImports } from '@nuxt/kit';

/**
 * Nuxt 模块选项（nuxt.config.ts 中的 `webStorage` 字段）
 */
export interface ModuleOptions {
  /** localStorage / sessionStorage 共用的 key 前缀，默认 'vue-storage-' */
  prefix?: string;
  /** 默认过期时间（毫秒），0 表示永不过期 */
  expires?: number;
  /** 是否默认混淆存储（XOR + Base64，非加密） */
  encrypt?: boolean;
  /** 混淆密钥 */
  encryptKey?: string;
  /** 挂到 globalProperties 上的名字，默认 '$storage' */
  globalName?: string;
  /** 单独覆盖 sessionStorage 实例的配置 */
  sessionStorage?: {
    prefix?: string;
    expires?: number;
    encrypt?: boolean;
    encryptKey?: string;
  };
  /**
   * 插件运行位置。默认 'all'：Vue 插件本身是 SSR 安全的（服务端所有操作为空操作），
   * 这样 `useWebStorage()` / `$storage` 在服务端渲染期间也可用；设为 'client' 则只在客户端安装。
   */
  mode?: 'all' | 'client';
  /** 是否自动导入 useLocalStorage / useSessionStorage / useIndexedDB / useWebStorage，默认 true */
  autoImports?: boolean;
}

const PACKAGE_NAME = 'vue-web-super-storage';

function toStorageOptions(o: { prefix?: string; expires?: number; encrypt?: boolean; encryptKey?: string }) {
  const out: Record<string, unknown> = {};
  if (o.prefix !== undefined) out.prefix = o.prefix;
  if (o.expires !== undefined) out.defaultExpires = o.expires;
  if (o.encrypt !== undefined) out.encrypt = o.encrypt;
  if (o.encryptKey !== undefined) out.encryptKey = o.encryptKey;
  return out;
}

/**
 * 把模块选项转换为 VueWebStoragePlugin 的安装参数（导出便于测试）
 */
export function resolvePluginOptions(options: ModuleOptions): Record<string, unknown> {
  const base = toStorageOptions(options);
  const session = { ...base, ...toStorageOptions(options.sessionStorage ?? {}) };
  const pluginOptions: Record<string, unknown> = {
    localStorage: base,
    sessionStorage: session
  };
  if (options.globalName) pluginOptions.globalName = options.globalName;
  return pluginOptions;
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: PACKAGE_NAME,
    configKey: 'webStorage',
    compatibility: { nuxt: '>=3.0.0' }
  },
  defaults: {
    prefix: 'vue-storage-',
    expires: 0,
    encrypt: false,
    mode: 'all',
    autoImports: true
  },
  setup(options) {
    const pluginOptions = resolvePluginOptions(options);
    const mode = options.mode === 'client' ? 'client' : 'all';

    addPluginTemplate({
      filename: mode === 'client' ? 'vue-web-super-storage.client.mjs' : 'vue-web-super-storage.mjs',
      mode,
      getContents: () => `import { defineNuxtPlugin } from '#app'
import { VueWebStoragePlugin } from '${PACKAGE_NAME}'

export default defineNuxtPlugin({
  name: '${PACKAGE_NAME}',
  setup(nuxtApp) {
    nuxtApp.vueApp.use(VueWebStoragePlugin, ${JSON.stringify(pluginOptions)})
  }
})
`
    });

    if (options.autoImports !== false) {
      addImports(
        ['useLocalStorage', 'useSessionStorage', 'useIndexedDB', 'useWebStorage'].map(name => ({
          name,
          from: PACKAGE_NAME
        }))
      );
    }
  }
});

declare module '@nuxt/schema' {
  interface NuxtConfig {
    webStorage?: ModuleOptions;
  }
  interface NuxtOptions {
    webStorage?: ModuleOptions;
  }
}
