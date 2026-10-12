import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, defineComponent, h, inject } from 'vue';
import {
  VueWebStoragePlugin,
  WEB_STORAGE_KEY,
  LOCAL_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  useWebStorage,
  StorageApi
} from '../src/plugin';
import { WebStorage, DEFAULT_PREFIX, __resetCleanupRegistry } from '../src/storage';
import { useLocalStorage } from '../src/composables';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  __resetCleanupRegistry();
});

function mountWith(options?: Parameters<typeof VueWebStoragePlugin.install>[1]) {
  const captured: Record<string, unknown> = {};
  const Child = defineComponent({
    setup() {
      captured.api = inject(WEB_STORAGE_KEY);
      captured.local = inject(LOCAL_STORAGE_KEY);
      captured.session = inject(SESSION_STORAGE_KEY);
      captured.legacyApi = inject('webStorage');
      captured.legacyLocal = inject('localStorage');
      captured.legacySession = inject('sessionStorage');
      captured.viaHelper = useWebStorage();
      return () => h('div');
    }
  });
  const app = createApp({ render: () => h(Child) });
  app.use(VueWebStoragePlugin, options);
  app.mount(document.createElement('div'));
  return { app, captured };
}

describe('VueWebStoragePlugin', () => {
  it('provides the API via symbol keys, legacy string keys and globalProperties', () => {
    const { app, captured } = mountWith();
    const api = captured.api as StorageApi;
    expect(api.local).toBeInstanceOf(WebStorage);
    expect(api.session).toBeInstanceOf(WebStorage);
    expect(captured.local).toBe(api.local);
    expect(captured.session).toBe(api.session);
    expect(captured.legacyApi).toBe(api);
    expect(captured.legacyLocal).toBe(api.local);
    expect(captured.legacySession).toBe(api.session);
    expect(captured.viaHelper).toBe(api);
    expect(app.config.globalProperties.$storage).toBe(api);
  });

  it('API methods work and respect options', () => {
    const { captured } = mountWith({ localStorage: { prefix: 'p-' }, globalName: '$ws' });
    const api = captured.api as StorageApi;
    expect(api.setLocal('a', { x: 1 })).toBe(true);
    expect(api.getLocal('a')).toEqual({ x: 1 });
    expect(localStorage.getItem('p-a')).not.toBeNull();
    expect(api.setSession('s', 'v')).toBe(true);
    expect(api.getSession('s')).toBe('v');
    expect(api.has('a')).toBe(true);
    expect(api.keys()).toEqual(['a']);
    expect(api.getStats().total).toBe(1);
    api.removeLocal('a');
    expect(api.getLocal('a')).toBeNull();
  });

  it('shares the default prefix with the composables', () => {
    const { captured } = mountWith();
    const api = captured.api as StorageApi;
    api.setLocal('theme', 'dark');
    expect(localStorage.getItem(DEFAULT_PREFIX + 'theme')).not.toBeNull();
    const [theme] = useLocalStorage('theme', 'light');
    expect(theme.value).toBe('dark');
  });

  it('useWebStorage throws when the plugin is not installed', () => {
    let error: unknown;
    const app = createApp(
      defineComponent({
        setup() {
          try {
            useWebStorage();
          } catch (e) {
            error = e;
          }
          return () => h('div');
        }
      })
    );
    app.mount(document.createElement('div'));
    expect(error).toBeInstanceOf(Error);
  });
});
