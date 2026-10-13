import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick, Ref } from 'vue';
import { useLocalStorage } from '../src/composables';
import { WebStorage, __resetCleanupRegistry } from '../src/storage';

const PREFIX = 'iom-';

beforeEach(() => {
  localStorage.clear();
  __resetCleanupRegistry();
});

describe('initOnMounted (SSR-friendly hydration)', () => {
  it('renders the default during setup and reads storage after mount', async () => {
    new WebStorage({ prefix: PREFIX }).set('theme', 'dark');
    let inSetup: string | undefined;
    let state!: Ref<string>;
    const Comp = defineComponent({
      setup() {
        const r = useLocalStorage('theme', 'light', { prefix: PREFIX, initOnMounted: true });
        inSetup = r.state.value;
        state = r.state;
        return () => h('div', state.value);
      }
    });
    const el = document.createElement('div');
    createApp(Comp).mount(el);

    expect(inSetup).toBe('light');
    // 首屏 DOM 用默认值渲染，与服务端输出一致
    expect(el.textContent).toBe('light');
    expect(state.value).toBe('dark');
    await nextTick();
    expect(el.textContent).toBe('dark');
    // 读取过程不会把默认值写回
    expect(new WebStorage({ prefix: PREFIX }).get('theme')).toBe('dark');
  });

  it('reads immediately when there is no component instance', () => {
    new WebStorage({ prefix: PREFIX }).set('k', 'stored');
    const [state] = useLocalStorage('k', 'default', { prefix: PREFIX, initOnMounted: true });
    expect(state.value).toBe('stored');
  });

  it('default behaviour is unchanged: reads synchronously in setup', () => {
    new WebStorage({ prefix: PREFIX }).set('k', 'stored');
    let inSetup: string | undefined;
    const Comp = defineComponent({
      setup() {
        inSetup = useLocalStorage('k', 'default', { prefix: PREFIX }).state.value;
        return () => h('div');
      }
    });
    createApp(Comp).mount(document.createElement('div'));
    expect(inSetup).toBe('stored');
  });
});
