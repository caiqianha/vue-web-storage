import { StorageItem, EncryptedEnvelope } from './types';
import { encrypt, decryptStrict, decryptLegacy } from './utils';

/**
 * 存储信封的编解码。WebStorage（同步）与 IndexedDBStorage（异步）共用，
 * 保证两种后端落盘的字符串格式完全一致：
 *
 * - 明文项：`{"value":…,"expires":…,"created":…,"v":…}`（`v` 仅在配置了 version 时写入）
 * - 混淆项：`{"vws":1,"encrypted":true,"data":"<base64>"}`，data 解码后即明文项
 * - 1.0.x 旧数据：整串 Base64，无标记
 */

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as EncryptedEnvelope).encrypted === true &&
    typeof (value as EncryptedEnvelope).data === 'string'
  );
}

export function isStorageItem(value: unknown): value is StorageItem {
  return !!value && typeof value === 'object' && 'value' in (value as object) && 'expires' in (value as object);
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * 先按新方案（UTF-8 字节 XOR）解码，解不出合法 StorageItem 时再按旧方案解码
 */
export function decodeObfuscated<T>(data: string, key: string): StorageItem<T> | null {
  const attempts: Array<() => string> = [() => decryptStrict(data, key), () => decryptLegacy(data, key)];
  for (const attempt of attempts) {
    try {
      const item = parseJson(attempt());
      if (isStorageItem(item)) return item as StorageItem<T>;
    } catch {
      // 尝试下一种方案
    }
  }
  return null;
}

export interface DecodedItem<T = any> {
  item: StorageItem<T>;
  /** 原始数据是否为混淆格式（写回迁移结果时沿用） */
  encrypted: boolean;
}

/**
 * 把存储的原始字符串解析为 StorageItem。
 * 支持三种格式：明文 JSON、带 encrypted 标记的信封、1.0.x 的无标记混淆串。
 */
export function decodeItem<T>(raw: string, encryptKey: string): DecodedItem<T> | null {
  const parsed = parseJson(raw);

  if (isEncryptedEnvelope(parsed)) {
    const item = decodeObfuscated<T>(parsed.data, encryptKey);
    return item ? { item, encrypted: true } : null;
  }

  if (isStorageItem(parsed)) {
    return { item: parsed as StorageItem<T>, encrypted: false };
  }

  // 旧版（1.0.x）数据：整串就是混淆后的 Base64，无任何标记
  const item = decodeObfuscated<T>(raw, encryptKey);
  return item ? { item, encrypted: true } : null;
}

export function encodeItem(item: StorageItem, shouldEncrypt: boolean, encryptKey: string): string {
  const json = JSON.stringify(item);
  if (!shouldEncrypt) return json;
  const envelope: EncryptedEnvelope = {
    vws: 1,
    encrypted: true,
    data: encrypt(json, encryptKey)
  };
  return JSON.stringify(envelope);
}

/**
 * 构造要写入的 StorageItem；只有配置了 version 才带 `v` 字段，
 * 这样未使用版本功能的用户写出的数据与 1.1.0 完全一致。
 */
export function buildItem<T>(value: T, expires: number | null, version: number | undefined): StorageItem<T> {
  const item: StorageItem<T> = { value, expires, created: Date.now() };
  if (version !== undefined) item.v = version;
  return item;
}

/** 存储项的版本：1.1.0 及更早的数据没有 `v`，视为 0 */
export function itemVersion(item: StorageItem): number {
  return typeof item.v === 'number' ? item.v : 0;
}
