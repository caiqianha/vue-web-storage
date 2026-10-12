// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import * as lib from '../src/index';
import pkg from '../package.json';

describe('server-side (no window)', () => {
  it('imports without touching the DOM and all operations are safe no-ops', () => {
    expect(typeof window).toBe('undefined');
    expect(lib.isBrowser()).toBe(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(lib.local.get('x')).toBeNull();
    expect(lib.local.get('x', { defaultValue: 'd' })).toBe('d');
    expect(lib.local.set('x', 1)).toBe(false);
    expect(lib.local.has('x')).toBe(false);
    expect(lib.local.remove('x')).toBe(false);
    expect(lib.local.clear()).toBe(false);
    expect(lib.local.keys()).toEqual([]);
    expect(lib.local.getAll()).toEqual({});
    expect(lib.local.clearExpired()).toBe(0);
    expect(lib.local.getStats()).toEqual({ total: 0, expired: 0, valid: 0, usedBytes: 0 });
    expect(lib.session.getStorage()).toBeNull();
    expect(lib.localStorage).toBe(lib.local);
    expect(lib.sessionStorage).toBe(lib.session);

    const s = new lib.WebStorage({ prefix: 'ssr-', encrypt: true });
    expect(s.set('k', '中文')).toBe(false);
    expect(s.get('k')).toBeNull();

    const [state, setValue, removeValue] = lib.useStorage('k', 'default');
    expect(state.value).toBe('default');
    setValue('v');
    expect(state.value).toBe('v');
    removeValue();
    expect(state.value).toBe('default');

    const st = lib.createStorageState('s', 1);
    st.value = 2;
    st.destroy();

    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('exposes the package version', () => {
    expect(lib.version).toBe(pkg.version);
    expect(lib.version).toBe('1.1.0');
  });

  it('encrypt / decrypt work in node too', () => {
    expect(lib.decrypt(lib.encrypt('中文😀', 'k'), 'k')).toBe('中文😀');
  });
});
