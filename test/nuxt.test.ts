import { describe, it, expect, vi } from 'vitest';
import { runWithNuxtContext } from '@nuxt/kit';
import type { Nuxt, NuxtTemplate, NuxtPlugin } from '@nuxt/schema';
import nuxtModule, { resolvePluginOptions, type ModuleOptions } from '../src/nuxt';

/**
 * 一个足够让 defineNuxtModule / addPluginTemplate / addImports 跑通的最小假 Nuxt 实例
 */
function fakeNuxt(config: ModuleOptions = {}) {
  const hooks: Record<string, Array<(...args: any[]) => unknown>> = {};
  const root = '/tmp/nuxt-fake';
  const nuxt = {
    version: '3.17.0',
    _version: '3.17.0',
    options: {
      _requiredModules: {},
      _installedModules: [],
      _layers: [],
      modules: [],
      builder: '@nuxt/vite-builder',
      build: { templates: [] as NuxtTemplate[], transpile: [] as string[] },
      plugins: [] as NuxtPlugin[],
      imports: { presets: [], imports: [] },
      modulesDir: [root + '/node_modules'],
      rootDir: root,
      srcDir: root,
      buildDir: root + '/.nuxt',
      alias: {},
      app: {},
      debug: false,
      experimental: {},
      webStorage: config
    },
    hook: (name: string, fn: (...args: any[]) => unknown) => {
      (hooks[name] ||= []).push(fn);
      return () => {};
    },
    hooks: {
      addHooks: vi.fn(),
      hook: (name: string, fn: (...args: any[]) => unknown) => {
        (hooks[name] ||= []).push(fn);
        return () => {};
      },
      callHook: async (name: string, ...args: unknown[]) => {
        for (const fn of hooks[name] ?? []) await fn(...args);
      }
    },
    callHook: async (name: string, ...args: unknown[]) => {
      for (const fn of hooks[name] ?? []) await fn(...args);
    },
    __hooks: hooks
  };
  return nuxt as unknown as Nuxt & { __hooks: typeof hooks };
}

async function install(options: ModuleOptions) {
  const nuxt = fakeNuxt(options);
  await runWithNuxtContext(nuxt, () => nuxtModule(options, nuxt));
  // @nuxt/kit 把插件直接写进 nuxt.options.plugins（字符串或 { src, mode }）
  const plugins = nuxt.options.plugins.map(p => (typeof p === 'string' ? { src: p } : p)) as NuxtPlugin[];
  const app = { plugins, templates: nuxt.options.build.templates as NuxtTemplate[] };
  const imports: Array<{ name: string; from: string }> = [];
  await nuxt.callHook('imports:extend' as any, imports as any);
  return { nuxt, app, imports };
}

describe('Nuxt module', () => {
  it('exposes meta compatible with nuxt.config `modules` / `webStorage`', async () => {
    const meta = await nuxtModule.getMeta!();
    expect(meta).toMatchObject({ name: 'vue-web-super-storage', configKey: 'webStorage' });
    expect(meta.compatibility).toEqual({ nuxt: '>=3.0.0' });
  });

  it('maps module options onto VueWebStoragePlugin options', () => {
    expect(resolvePluginOptions({})).toEqual({ localStorage: {}, sessionStorage: {} });
    expect(
      resolvePluginOptions({
        prefix: 'p-',
        expires: 5,
        encrypt: true,
        encryptKey: 'k',
        globalName: '$ws',
        sessionStorage: { prefix: 's-', encrypt: false }
      })
    ).toEqual({
      localStorage: { prefix: 'p-', defaultExpires: 5, encrypt: true, encryptKey: 'k' },
      sessionStorage: { prefix: 's-', defaultExpires: 5, encrypt: false, encryptKey: 'k' },
      globalName: '$ws'
    });
  });

  it('registers a universal plugin template with the resolved options and auto-imports the composables', async () => {
    const { nuxt, app, imports } = await install({ prefix: 'n-', expires: 1000 });

    const template = nuxt.options.build.templates.find(t => t.filename === 'vue-web-super-storage.mjs');
    expect(template).toBeDefined();
    const contents = await template!.getContents!({ nuxt, app: app as any, options: {} });
    expect(contents).toContain("from 'vue-web-super-storage'");
    expect(contents).toContain('VueWebStoragePlugin');
    expect(contents).toContain('"prefix":"n-"');
    expect(contents).toContain('"defaultExpires":1000');
    expect(contents).toContain('"encrypt":false');

    const plugin = app.plugins.find(p => p.src.endsWith('vue-web-super-storage.mjs'));
    expect(plugin).toBeDefined();
    expect(plugin!.mode ?? 'all').toBe('all');

    expect(imports.map(i => `${i.name}@${i.from}`).sort()).toEqual([
      'useIndexedDB@vue-web-super-storage',
      'useLocalStorage@vue-web-super-storage',
      'useSessionStorage@vue-web-super-storage',
      'useWebStorage@vue-web-super-storage'
    ]);
  });

  it('supports client-only mode and disabling auto-imports', async () => {
    const { nuxt, app, imports } = await install({ mode: 'client', autoImports: false });
    const template = nuxt.options.build.templates.find(t => t.filename === 'vue-web-super-storage.client.mjs');
    expect(template).toBeDefined();
    const plugin = app.plugins.find(p => p.src.endsWith('vue-web-super-storage.client.mjs'));
    expect(plugin?.mode).toBe('client');
    expect(imports).toEqual([]);
  });
});
