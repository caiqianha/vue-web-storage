import { describe, it, expect, vi } from 'vitest';
import { reactive } from 'vue';
import {
  encrypt,
  decrypt,
  decryptLegacy,
  calculateExpires,
  normalizeExpires,
  isExpired,
  formatBytes,
  deepClone,
  serialize,
  deserialize
} from '../src/utils';
import { legacyEncrypt } from './helpers';

describe('encrypt / decrypt', () => {
  it('round-trips UTF-8 text including CJK and emoji', () => {
    const text = '中文😀 café ñ';
    const encoded = encrypt(text, 'k3y');
    expect(encoded).not.toContain('中');
    expect(decrypt(encoded, 'k3y')).toBe(text);
  });

  it('works with a non-ASCII key', () => {
    const encoded = encrypt('hello', '密钥');
    expect(decrypt(encoded, '密钥')).toBe('hello');
  });

  it('decodes values written by the 1.0.x scheme (ASCII and Latin-1)', () => {
    expect(decrypt(legacyEncrypt('{"a":1}'))).toBe('{"a":1}');
    expect(decrypt(legacyEncrypt('café', 'secret'), 'secret')).toBe('café');
    expect(decryptLegacy(legacyEncrypt('plain'))).toBe('plain');
  });

  it('returns the input untouched when nothing can decode it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(decrypt('not base64 at all!!', 'k')).toBe('not base64 at all!!');
    expect(warn).toHaveBeenCalled();
  });

  it('serialize / deserialize honour the encrypt flag', () => {
    const data = { name: '张三', tags: ['😀'] };
    const plain = serialize(data);
    expect(JSON.parse(plain)).toEqual(data);
    const obfuscated = serialize(data, true, 'k');
    expect(obfuscated).not.toContain('张三');
    expect(deserialize(obfuscated, true, 'k')).toEqual(data);
  });
});

describe('expiry helpers', () => {
  it('treats undefined / null / 0 as "never expires"', () => {
    expect(calculateExpires()).toBeNull();
    expect(calculateExpires(null)).toBeNull();
    expect(calculateExpires(0)).toBeNull();
    expect(normalizeExpires(undefined)).toBeNull();
  });

  it('computes an absolute timestamp for a positive TTL', () => {
    const now = Date.now();
    const expires = calculateExpires(1000)!;
    expect(expires).toBeGreaterThanOrEqual(now + 1000);
    expect(isExpired(expires)).toBe(false);
    expect(isExpired(now - 1)).toBe(true);
    expect(isExpired(null)).toBe(false);
  });

  it('throws TypeError for NaN, negative, non-finite or non-number TTL', () => {
    expect(() => calculateExpires(NaN)).toThrow(TypeError);
    expect(() => calculateExpires(-1)).toThrow(TypeError);
    expect(() => calculateExpires(Infinity)).toThrow(TypeError);
    expect(() => calculateExpires('1000' as unknown as number)).toThrow(TypeError);
  });
});

describe('misc helpers', () => {
  it('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
  });

  it('deepClone copies plain data and Vue reactive proxies', () => {
    const original = { a: { b: [1, { c: new Date(0) }] } };
    const copy = deepClone(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.a.b).not.toBe(original.a.b);

    const proxy = reactive({ list: [1, 2, 3], nested: { ok: true } });
    const cloned = deepClone(proxy);
    expect(cloned).toEqual({ list: [1, 2, 3], nested: { ok: true } });
    expect(cloned).not.toBe(proxy);
  });
});
