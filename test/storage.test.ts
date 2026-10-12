import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebStorage, __resetCleanupRegistry, DEFAULT_PREFIX } from '../src/storage';
import { StorageType } from '../src/types';
import { legacyEncrypt } from './helpers';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  __resetCleanupRegistry();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('basic set / get / has / remove / clear', () => {
  it('stores and retrieves typed values', () => {
    const s = new WebStorage({ prefix: 't-' });
    expect(s.set('num', 42)).toBe(true);
    expect(s.set('obj', { a: [1, 2], b: 'x' })).toBe(true);
    expect(s.get<number>('num')).toBe(42);
    expect(s.get('obj')).toEqual({ a: [1, 2], b: 'x' });
    expect(s.has('num')).toBe(true);
    expect(s.has('missing')).toBe(false);
    expect(s.get('missing')).toBeNull();
    expect(s.get('missing', { defaultValue: 'd' })).toBe('d');
    expect(localStorage.getItem('t-num')).not.toBeNull();
  });

  it('remove and clear only touch the prefixed keys', () => {
    const s = new WebStorage({ prefix: 't-' });
    localStorage.setItem('foreign', '1');
    s.set('a', 1);
    s.set('b', 2);
    expect(s.remove('a')).toBe(true);
    expect(s.has('a')).toBe(false);
    expect(s.keys()).toEqual(['b']);
    expect(s.clear()).toBe(true);
    expect(s.keys()).toEqual([]);
    expect(localStorage.getItem('foreign')).toBe('1');
  });

  it('getAll returns every valid item without the prefix', () => {
    const s = new WebStorage({ prefix: 't-' });
    s.set('a', 1);
    s.set('b', { x: 1 });
    expect(s.getAll()).toEqual({ a: 1, b: { x: 1 } });
  });

  it('uses sessionStorage when asked', () => {
    const s = new WebStorage({ type: StorageType.SESSION, prefix: 't-' });
    s.set('k', 'v');
    expect(sessionStorage.getItem('t-k')).not.toBeNull();
    expect(localStorage.getItem('t-k')).toBeNull();
    expect(s.getStorage()).toBe(sessionStorage);
  });

  it('returns a fresh object on every get (no shared references)', () => {
    const s = new WebStorage({ prefix: 't-' });
    s.set('o', { n: 1 });
    const a = s.get<{ n: number }>('o')!;
    a.n = 99;
    expect(s.get<{ n: number }>('o')!.n).toBe(1);
  });

  it('emits events', () => {
    const s = new WebStorage({ prefix: 't-' });
    const events: string[] = [];
    (['set', 'get', 'remove', 'clear'] as const).forEach(t => s.on(t, e => events.push(e.type)));
    s.set('a', 1);
    s.get('a');
    s.remove('a');
    s.clear();
    expect(events).toEqual(['set', 'get', 'remove', 'clear']);
  });
});

describe('TTL', () => {
  it('expires items and cleans them up on read', () => {
    vi.useFakeTimers();
    const s = new WebStorage({ prefix: 't-' });
    const expired = vi.fn();
    s.on('expired', expired);
    s.set('tok', 'abc', { expires: 1000 });
    vi.advanceTimersByTime(999);
    expect(s.get('tok')).toBe('abc');
    vi.advanceTimersByTime(2);
    expect(s.get('tok')).toBeNull();
    expect(localStorage.getItem('t-tok')).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('applies defaultExpires and lets expires: 0 override it to "never"', () => {
    vi.useFakeTimers();
    const s = new WebStorage({ prefix: 't-', defaultExpires: 500 });
    s.set('short', 1);
    s.set('forever', 2, { expires: 0 });
    vi.advanceTimersByTime(501);
    expect(s.has('short')).toBe(false);
    expect(s.has('forever')).toBe(true);
  });

  it('clearExpired and getStats report expired entries', () => {
    vi.useFakeTimers();
    const s = new WebStorage({ prefix: 't-' });
    s.set('a', 1, { expires: 10 });
    s.set('b', 2);
    vi.advanceTimersByTime(11);
    expect(s.getStats()).toMatchObject({ total: 2, expired: 1, valid: 1 });
    expect(s.clearExpired()).toBe(1);
    expect(s.keys()).toEqual(['b']);
  });

  it('rejects invalid TTL values with a TypeError', () => {
    const s = new WebStorage({ prefix: 't-' });
    expect(() => s.set('k', 1, { expires: -5 })).toThrow(TypeError);
    expect(() => s.set('k', 1, { expires: NaN })).toThrow(TypeError);
    expect(() => s.set('k', 1, { expires: Infinity })).toThrow(TypeError);
    expect(localStorage.getItem('t-k')).toBeNull();
    expect(() => new WebStorage({ defaultExpires: -1 })).toThrow(TypeError);
  });
});

describe('prefix / namespace isolation', () => {
  it('instances with different prefixes do not see each other', () => {
    const a = new WebStorage({ prefix: 'a-' });
    const b = new WebStorage({ prefix: 'b-' });
    a.set('k', 'from-a');
    b.set('k', 'from-b');
    expect(a.get('k')).toBe('from-a');
    expect(b.get('k')).toBe('from-b');
    expect(a.keys()).toEqual(['k']);
    a.clear();
    expect(b.get('k')).toBe('from-b');
  });

  it('defaults to the shared prefix', () => {
    const s = new WebStorage();
    s.set('k', 1);
    expect(localStorage.getItem(DEFAULT_PREFIX + 'k')).not.toBeNull();
    expect(s.getFullKey('k')).toBe(DEFAULT_PREFIX + 'k');
    expect(new WebStorage({ prefix: undefined }).getOptions().prefix).toBe(DEFAULT_PREFIX);
  });
});

describe('obfuscation (encrypt option)', () => {
  it('instance-level encrypt round-trips UTF-8 content', () => {
    const s = new WebStorage({ prefix: 't-', encrypt: true, encryptKey: 'secret' });
    const value = { msg: '中文😀', list: ['é'] };
    expect(s.set('k', value)).toBe(true);
    const raw = localStorage.getItem('t-k')!;
    expect(raw).not.toContain('中文');
    expect(JSON.parse(raw)).toMatchObject({ encrypted: true });
    expect(s.get('k')).toEqual(value);
    expect(s.has('k')).toBe(true);
    expect(s.keys()).toEqual(['k']);
  });

  it('per-item encrypt: true is readable even when the instance is not encrypting', () => {
    vi.useFakeTimers();
    const s = new WebStorage({ prefix: 't-' });
    s.set('secret', '中文😀', { encrypt: true, expires: 1000 });
    s.set('plain', 'visible');
    expect(localStorage.getItem('t-secret')).not.toContain('中文');
    expect(localStorage.getItem('t-plain')).toContain('visible');

    expect(s.get('secret')).toBe('中文😀');
    expect(s.has('secret')).toBe(true);
    expect(s.keys().sort()).toEqual(['plain', 'secret']);
    expect(s.getAll()).toEqual({ secret: '中文😀', plain: 'visible' });
    expect(s.getStats()).toMatchObject({ total: 2, valid: 2, expired: 0 });

    vi.advanceTimersByTime(1001);
    expect(s.getStats()).toMatchObject({ expired: 1 });
    expect(s.clearExpired()).toBe(1);
    expect(s.has('secret')).toBe(false);
  });

  it('per-item encrypt: false opts out of an encrypting instance', () => {
    const s = new WebStorage({ prefix: 't-', encrypt: true });
    s.set('open', 'visible', { encrypt: false });
    expect(localStorage.getItem('t-open')).toContain('visible');
    expect(s.get('open')).toBe('visible');
  });

  it('still reads values written by the 1.0.x scheme', () => {
    const key = 'legacy-key';
    const item = JSON.stringify({ value: { name: 'café', n: 1 }, expires: null, created: 1 });
    localStorage.setItem('t-old', legacyEncrypt(item, key));

    const s = new WebStorage({ prefix: 't-', encrypt: true, encryptKey: key });
    expect(s.get('old')).toEqual({ name: 'café', n: 1 });
    expect(s.has('old')).toBe(true);

    // 旧版 per-item encrypt 写出的数据（实例未开启 encrypt）现在也能读
    const plainInstance = new WebStorage({ prefix: 't-', encryptKey: key });
    expect(plainInstance.get('old')).toEqual({ name: 'café', n: 1 });
  });

  it('still reads plain values written by 1.0.x', () => {
    localStorage.setItem('t-plain', JSON.stringify({ value: 'v', expires: null, created: 1 }));
    expect(new WebStorage({ prefix: 't-' }).get('plain')).toBe('v');
  });

  it('ignores garbage that is neither JSON nor obfuscated data', () => {
    localStorage.setItem('t-junk', 'definitely not ours {');
    const s = new WebStorage({ prefix: 't-' });
    expect(s.get('junk')).toBeNull();
    expect(s.has('junk')).toBe(false);
    expect(s.keys()).toEqual([]);
  });
});

describe('automatic cleanup', () => {
  function seedExpired(prefix: string) {
    localStorage.setItem(prefix + 'dead', JSON.stringify({ value: 1, expires: Date.now() - 1, created: 0 }));
  }

  it('does not touch storage in the constructor and cleans once per prefix', () => {
    seedExpired('c-');
    const spy = vi.spyOn(WebStorage.prototype, 'clearExpired');
    const a = new WebStorage({ prefix: 'c-' });
    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.getItem('c-dead')).not.toBeNull();

    a.get('anything');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('c-dead')).toBeNull();

    seedExpired('c-');
    const b = new WebStorage({ prefix: 'c-' });
    b.get('anything');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('c-dead')).not.toBeNull();

    const other = new WebStorage({ prefix: 'other-' });
    other.get('x');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('can be disabled with autoCleanup: false', () => {
    seedExpired('c-');
    const s = new WebStorage({ prefix: 'c-', autoCleanup: false });
    s.get('x');
    expect(localStorage.getItem('c-dead')).not.toBeNull();
  });

  it('cleanupInterval runs clearExpired periodically with one timer per prefix', () => {
    vi.useFakeTimers();
    const s = new WebStorage({ prefix: 'c-', cleanupInterval: 1000 });
    const s2 = new WebStorage({ prefix: 'c-', cleanupInterval: 1000 });
    s.set('tmp', 1, { expires: 500 });
    s2.get('x');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(localStorage.getItem('c-tmp')).toBeNull();
    s.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
