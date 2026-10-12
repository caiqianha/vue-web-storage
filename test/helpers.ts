/** 1.0.x 的混淆算法：按 UTF-16 码元 XOR 后 btoa（只支持 Latin-1），用于构造老数据 */
export function legacyEncrypt(text: string, key = 'vue-web-storage'): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(out);
}
