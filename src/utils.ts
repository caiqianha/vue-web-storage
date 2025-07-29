/**
 * 简单的加密函数（基于 Base64 和简单的字符偏移）
 * 注意：这只是演示用的简单加密，实际项目建议使用更安全的加密方式
 */
export function encrypt(text: string, key: string = 'vue-web-storage'): string {
  const keyLength = key.length;
  let encrypted = '';
  
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const keyCode = key.charCodeAt(i % keyLength);
    encrypted += String.fromCharCode(charCode ^ keyCode);
  }
  
  return btoa(encrypted);
}

/**
 * 简单的解密函数
 */
export function decrypt(encryptedText: string, key: string = 'vue-web-storage'): string {
  try {
    const text = atob(encryptedText);
    const keyLength = key.length;
    let decrypted = '';
    
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const keyCode = key.charCodeAt(i % keyLength);
      decrypted += String.fromCharCode(charCode ^ keyCode);
    }
    
    return decrypted;
  } catch (error) {
    console.warn('解密失败:', error);
    return encryptedText;
  }
}

/**
 * 检查是否过期
 */
export function isExpired(expires: number | null): boolean {
  if (expires === null) return false;
  return Date.now() > expires;
}

/**
 * 计算过期时间
 */
export function calculateExpires(expires?: number): number | null {
  if (expires === undefined) return null;
  return Date.now() + expires;
}

/**
 * 序列化数据
 */
export function serialize(data: any, shouldEncrypt: boolean = false, encryptKey?: string): string {
  const jsonString = JSON.stringify(data);
  return shouldEncrypt ? encrypt(jsonString, encryptKey) : jsonString;
}

/**
 * 反序列化数据
 */
export function deserialize(data: string, encrypted: boolean = false, encryptKey?: string): any {
  try {
    const jsonString = encrypted ? decrypt(data, encryptKey) : data;
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('反序列化失败:', error);
    return null;
  }
}

/**
 * 获取存储占用的字节数
 */
export function getStorageSize(storage: Storage): number {
  let total = 0;
  for (let key in storage) {
    if (storage.hasOwnProperty(key)) {
      total += storage[key].length + key.length;
    }
  }
  return total;
}

/**
 * 格式化字节数
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 深拷贝对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as any;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as any;
  if (typeof obj === 'object') {
    const copy: any = {};
    Object.keys(obj).forEach(key => {
      copy[key] = deepClone((obj as any)[key]);
    });
    return copy;
  }
  return obj;
}
