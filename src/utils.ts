const DEFAULT_KEY = 'vue-web-storage';

/** 识别新版混淆数据的前缀，避免和旧版无标记的 Base64 混淆 */
const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: true }) : null;

function utf8Encode(text: string): Uint8Array {
  if (textEncoder) return textEncoder.encode(text);
  // 极少数没有 TextEncoder 的环境：走 percent-encoding 路径
  const escaped = encodeURIComponent(text);
  const bytes: number[] = [];
  for (let i = 0; i < escaped.length; i++) {
    const ch = escaped[i];
    if (ch === '%') {
      bytes.push(parseInt(escaped.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0));
    }
  }
  return Uint8Array.from(bytes);
}

function utf8Decode(bytes: Uint8Array): string {
  if (textDecoder) return textDecoder.decode(bytes);
  let percent = '';
  for (let i = 0; i < bytes.length; i++) {
    percent += '%' + bytes[i].toString(16).padStart(2, '0');
  }
  return decodeURIComponent(percent);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 混淆文本：UTF-8 编码 → 与密钥字节逐位 XOR → Base64。
 *
 * 注意：这只是防止明文直接暴露的混淆手段（XOR + Base64），
 * 不是密码学意义上的加密，不能用于保护真正敏感的数据。
 */
export function encrypt(text: string, key: string = DEFAULT_KEY): string {
  const keyBytes = utf8Encode(key || DEFAULT_KEY);
  const data = utf8Encode(text);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ keyBytes[i % keyBytes.length];
  }
  return bytesToBase64(out);
}

/**
 * 旧版（1.0.x）解码：按 UTF-16 码元 XOR 后 btoa，只支持 Latin-1。
 * 保留用于读取老数据。
 */
export function decryptLegacy(encryptedText: string, key: string = DEFAULT_KEY): string {
  const text = atob(encryptedText);
  const k = key || DEFAULT_KEY;
  let decrypted = '';
  for (let i = 0; i < text.length; i++) {
    decrypted += String.fromCharCode(text.charCodeAt(i) ^ k.charCodeAt(i % k.length));
  }
  return decrypted;
}

/**
 * 严格解码：新方案失败时尝试旧方案，都失败则抛出异常。
 */
export function decryptStrict(encryptedText: string, key: string = DEFAULT_KEY): string {
  try {
    const keyBytes = utf8Encode(key || DEFAULT_KEY);
    const data = base64ToBytes(encryptedText);
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = data[i] ^ keyBytes[i % keyBytes.length];
    }
    return utf8Decode(out);
  } catch {
    return decryptLegacy(encryptedText, key);
  }
}

/**
 * 解码混淆文本；新旧两种方案都失败时返回原文（与 1.0.x 行为一致）。
 */
export function decrypt(encryptedText: string, key: string = DEFAULT_KEY): string {
  try {
    return decryptStrict(encryptedText, key);
  } catch (error) {
    console.warn('[vue-web-super-storage] decrypt failed:', error);
    return encryptedText;
  }
}

/**
 * 检查是否过期
 */
export function isExpired(expires: number | null | undefined): boolean {
  if (expires === null || expires === undefined) return false;
  return Date.now() > expires;
}

/**
 * 校验过期时间参数：undefined / null / 0 表示永不过期，
 * 其他必须是非负有限数，否则抛出 TypeError。
 */
export function normalizeExpires(expires: number | null | undefined, name = 'expires'): number | null {
  if (expires === undefined || expires === null || expires === 0) return null;
  if (typeof expires !== 'number' || !Number.isFinite(expires) || expires < 0) {
    throw new TypeError(
      `[vue-web-super-storage] "${name}" must be a finite number >= 0 (milliseconds), received ${String(expires)}`
    );
  }
  return expires;
}

/**
 * 计算过期时间戳；0 / undefined 返回 null（永不过期）
 */
export function calculateExpires(expires?: number | null): number | null {
  const ttl = normalizeExpires(expires);
  return ttl === null ? null : Date.now() + ttl;
}

/**
 * 序列化数据
 */
export function serialize(data: unknown, shouldEncrypt: boolean = false, encryptKey?: string): string {
  const jsonString = JSON.stringify(data);
  return shouldEncrypt ? encrypt(jsonString, encryptKey) : jsonString;
}

/**
 * 反序列化数据
 */
export function deserialize<T = unknown>(data: string, encrypted: boolean = false, encryptKey?: string): T | null {
  try {
    const jsonString = encrypted ? decryptStrict(data, encryptKey) : data;
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.warn('[vue-web-super-storage] deserialize failed:', error);
    return null;
  }
}

/**
 * 获取 storage 占用大小（UTF-16 码元数，近似字节数）
 */
export function getStorageSize(storage: Storage): number {
  let total = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === null) continue;
    total += key.length + (storage.getItem(key)?.length ?? 0);
  }
  return total;
}

/**
 * 格式化字节数
 */
export function formatBytes(bytes: number): string {
  if (!bytes) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function cloneFallback<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (Array.isArray(obj)) return obj.map(item => cloneFallback(item)) as unknown as T;
  const copy: Record<string, unknown> = {};
  Object.keys(obj as object).forEach(key => {
    copy[key] = cloneFallback((obj as Record<string, unknown>)[key]);
  });
  return copy as T;
}

/**
 * 深拷贝：优先 structuredClone，不可用或遇到不可克隆对象（如 Vue 响应式代理）时回退到递归拷贝
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch {
      // Proxy / 函数等不可克隆，走回退
    }
  }
  return cloneFallback(obj);
}
