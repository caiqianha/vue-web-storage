/*!
 * vue-web-storage v1.0.0
 * (c) 2025 caiqianha
 * Released under the MIT License.
 */
import { ref, watch, onUnmounted } from 'vue';

/**
 * Storage 类型枚举
 */
var StorageType;
(function (StorageType) {
    StorageType["LOCAL"] = "localStorage";
    StorageType["SESSION"] = "sessionStorage";
})(StorageType || (StorageType = {}));

/**
 * 简单的加密函数（基于 Base64 和简单的字符偏移）
 * 注意：这只是演示用的简单加密，实际项目建议使用更安全的加密方式
 */
function encrypt(text, key = 'vue-web-storage') {
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
function decrypt(encryptedText, key = 'vue-web-storage') {
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
    }
    catch (error) {
        console.warn('解密失败:', error);
        return encryptedText;
    }
}
/**
 * 检查是否过期
 */
function isExpired(expires) {
    if (expires === null)
        return false;
    return Date.now() > expires;
}
/**
 * 计算过期时间
 */
function calculateExpires(expires) {
    if (expires === undefined)
        return null;
    return Date.now() + expires;
}
/**
 * 序列化数据
 */
function serialize(data, shouldEncrypt = false, encryptKey) {
    const jsonString = JSON.stringify(data);
    return shouldEncrypt ? encrypt(jsonString, encryptKey) : jsonString;
}
/**
 * 反序列化数据
 */
function deserialize(data, encrypted = false, encryptKey) {
    try {
        const jsonString = encrypted ? decrypt(data, encryptKey) : data;
        return JSON.parse(jsonString);
    }
    catch (error) {
        console.warn('反序列化失败:', error);
        return null;
    }
}
/**
 * 获取存储占用的字节数
 */
function getStorageSize(storage) {
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
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
/**
 * 深拷贝对象
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object')
        return obj;
    if (obj instanceof Date)
        return new Date(obj.getTime());
    if (obj instanceof Array)
        return obj.map(item => deepClone(item));
    if (typeof obj === 'object') {
        const copy = {};
        Object.keys(obj).forEach(key => {
            copy[key] = deepClone(obj[key]);
        });
        return copy;
    }
    return obj;
}

/**
 * WebStorage 封装类
 */
class WebStorage {
    constructor(options = {}) {
        this.listeners = new Map();
        this.options = {
            type: StorageType.LOCAL,
            defaultExpires: 0,
            prefix: 'vue-storage-',
            encrypt: false,
            encryptKey: 'vue-web-storage',
            ...options
        };
        // 获取对应的 storage 对象
        this.storage = this.options.type === StorageType.LOCAL
            ? localStorage
            : sessionStorage;
        // 初始化时清理过期数据
        this.clearExpired();
    }
    /**
     * 生成完整的 key
     */
    getFullKey(key) {
        return this.options.prefix + key;
    }
    /**
     * 触发事件
     */
    emit(type, data = {}) {
        const listeners = this.listeners.get(type);
        if (listeners && listeners.size > 0) {
            const eventData = {
                type,
                timestamp: Date.now(),
                ...data
            };
            listeners.forEach(listener => {
                try {
                    listener(eventData);
                }
                catch (error) {
                    console.error('Storage event listener error:', error);
                }
            });
        }
    }
    /**
     * 设置存储项
     */
    set(key, value, options = {}) {
        try {
            const fullKey = this.getFullKey(key);
            const expires = calculateExpires((options.expires ?? this.options.defaultExpires) || undefined);
            const item = {
                value: deepClone(value),
                expires,
                created: Date.now()
            };
            const shouldEncrypt = options.encrypt ?? this.options.encrypt;
            const serializedData = serialize(item, shouldEncrypt, this.options.encryptKey);
            this.storage.setItem(fullKey, serializedData);
            this.emit('set', { key, value });
            return true;
        }
        catch (error) {
            console.error('Storage set error:', error);
            return false;
        }
    }
    /**
     * 获取存储项
     */
    get(key, options = {}) {
        try {
            const fullKey = this.getFullKey(key);
            const data = this.storage.getItem(fullKey);
            if (!data) {
                return (options.defaultValue ?? null);
            }
            const item = deserialize(data, this.options.encrypt, this.options.encryptKey);
            if (!item || typeof item !== 'object' || !('value' in item)) {
                return (options.defaultValue ?? null);
            }
            // 检查是否过期
            if (isExpired(item.expires)) {
                this.remove(key);
                this.emit('expired', { key });
                return (options.defaultValue ?? null);
            }
            this.emit('get', { key, value: item.value });
            return deepClone(item.value);
        }
        catch (error) {
            console.error('Storage get error:', error);
            return (options.defaultValue ?? null);
        }
    }
    /**
     * 检查存储项是否存在且未过期
     */
    has(key) {
        try {
            const fullKey = this.getFullKey(key);
            const data = this.storage.getItem(fullKey);
            if (!data)
                return false;
            const item = deserialize(data, this.options.encrypt, this.options.encryptKey);
            if (!item || typeof item !== 'object' || !('expires' in item)) {
                return false;
            }
            if (isExpired(item.expires)) {
                this.remove(key);
                return false;
            }
            return true;
        }
        catch (error) {
            console.error('Storage has error:', error);
            return false;
        }
    }
    /**
     * 删除存储项
     */
    remove(key) {
        try {
            const fullKey = this.getFullKey(key);
            this.storage.removeItem(fullKey);
            this.emit('remove', { key });
            return true;
        }
        catch (error) {
            console.error('Storage remove error:', error);
            return false;
        }
    }
    /**
     * 清空所有存储项（只清理带前缀的）
     */
    clear() {
        try {
            const keysToRemove = [];
            for (let i = 0; i < this.storage.length; i++) {
                const key = this.storage.key(i);
                if (key && key.startsWith(this.options.prefix)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => {
                this.storage.removeItem(key);
            });
            this.emit('clear');
            return true;
        }
        catch (error) {
            console.error('Storage clear error:', error);
            return false;
        }
    }
    /**
     * 清理过期的存储项
     */
    clearExpired() {
        let clearedCount = 0;
        const keysToRemove = [];
        try {
            for (let i = 0; i < this.storage.length; i++) {
                const fullKey = this.storage.key(i);
                if (!fullKey || !fullKey.startsWith(this.options.prefix)) {
                    continue;
                }
                const data = this.storage.getItem(fullKey);
                if (!data)
                    continue;
                const item = deserialize(data, this.options.encrypt, this.options.encryptKey);
                if (item && typeof item === 'object' && 'expires' in item) {
                    if (isExpired(item.expires)) {
                        keysToRemove.push(fullKey);
                    }
                }
            }
            keysToRemove.forEach(key => {
                this.storage.removeItem(key);
                clearedCount++;
            });
            if (clearedCount > 0) {
                this.emit('expired');
            }
            return clearedCount;
        }
        catch (error) {
            console.error('Storage clearExpired error:', error);
            return clearedCount;
        }
    }
    /**
     * 获取所有键名（不包含前缀）
     */
    keys() {
        const keys = [];
        const prefixLength = this.options.prefix.length;
        try {
            for (let i = 0; i < this.storage.length; i++) {
                const fullKey = this.storage.key(i);
                if (fullKey && fullKey.startsWith(this.options.prefix)) {
                    const key = fullKey.substring(prefixLength);
                    if (this.has(key)) {
                        keys.push(key);
                    }
                }
            }
        }
        catch (error) {
            console.error('Storage keys error:', error);
        }
        return keys;
    }
    /**
     * 获取存储统计信息
     */
    getStats() {
        let total = 0;
        let expired = 0;
        let valid = 0;
        let usedBytes = 0;
        try {
            for (let i = 0; i < this.storage.length; i++) {
                const fullKey = this.storage.key(i);
                if (!fullKey || !fullKey.startsWith(this.options.prefix)) {
                    continue;
                }
                const data = this.storage.getItem(fullKey);
                if (!data)
                    continue;
                total++;
                usedBytes += fullKey.length + data.length;
                const item = deserialize(data, this.options.encrypt, this.options.encryptKey);
                if (item && typeof item === 'object' && 'expires' in item) {
                    if (isExpired(item.expires)) {
                        expired++;
                    }
                    else {
                        valid++;
                    }
                }
                else {
                    valid++; // 无过期时间的项目视为有效
                }
            }
        }
        catch (error) {
            console.error('Storage getStats error:', error);
        }
        return { total, expired, valid, usedBytes };
    }
    /**
     * 添加事件监听器
     */
    on(type, listener) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type).add(listener);
    }
    /**
     * 移除事件监听器
     */
    off(type, listener) {
        const listeners = this.listeners.get(type);
        if (listeners) {
            listeners.delete(listener);
        }
    }
    /**
     * 获取原始 Storage 对象
     */
    getStorage() {
        return this.storage;
    }
    /**
     * 获取配置选项
     */
    getOptions() {
        return { ...this.options };
    }
}

/**
 * 响应式存储组合函数
 */
function useStorage(key, defaultValue, options = {}) {
    const storage = new WebStorage(options);
    // 创建响应式引用
    const storedValue = storage.get(key, { defaultValue });
    const state = ref(storedValue ?? defaultValue);
    // 设置值的函数
    const setValue = (value, setOptions) => {
        state.value = value;
        storage.set(key, value, setOptions);
    };
    // 移除值的函数
    const removeValue = () => {
        storage.remove(key);
        state.value = defaultValue;
    };
    // 监听状态变化并同步到存储
    const stopWatcher = watch(state, (newValue) => {
        storage.set(key, newValue);
    }, { deep: true });
    // 组件卸载时停止监听
    onUnmounted(() => {
        stopWatcher();
    });
    return [state, setValue, removeValue];
}
/**
 * localStorage 组合函数
 */
function useLocalStorage(key, defaultValue, options = {}) {
    return useStorage(key, defaultValue, { ...options, type: StorageType.LOCAL });
}
/**
 * sessionStorage 组合函数
 */
function useSessionStorage(key, defaultValue, options = {}) {
    return useStorage(key, defaultValue, { ...options, type: StorageType.SESSION });
}
/**
 * 存储状态管理器
 */
class StorageState {
    constructor(key, defaultValue, options = {}) {
        this.key = key;
        this.defaultValue = defaultValue;
        this.storage = new WebStorage(options);
        const storedValue = this.storage.get(key, { defaultValue });
        this.state = ref(storedValue ?? defaultValue);
        this.startWatching();
    }
    /**
     * 开始监听状态变化
     */
    startWatching() {
        this.stopWatcher = watch(this.state, (newValue) => {
            this.storage.set(this.key, newValue);
        }, { deep: true });
    }
    /**
     * 获取当前值
     */
    get value() {
        return this.state.value;
    }
    /**
     * 设置值
     */
    set value(newValue) {
        this.state.value = newValue;
    }
    /**
     * 获取响应式引用
     */
    get ref() {
        return this.state;
    }
    /**
     * 设置值（带选项）
     */
    setValue(value, options) {
        this.state.value = value;
        this.storage.set(this.key, value, options);
    }
    /**
     * 重置为默认值
     */
    reset() {
        this.state.value = this.defaultValue;
    }
    /**
     * 从存储中移除
     */
    remove() {
        this.storage.remove(this.key);
        this.state.value = this.defaultValue;
    }
    /**
     * 刷新值（从存储重新读取）
     */
    refresh() {
        const storedValue = this.storage.get(this.key, { defaultValue: this.defaultValue });
        this.state.value = storedValue ?? this.defaultValue;
    }
    /**
     * 停止监听
     */
    destroy() {
        if (this.stopWatcher) {
            this.stopWatcher();
            this.stopWatcher = undefined;
        }
    }
}
/**
 * 创建存储状态
 */
function createStorageState(key, defaultValue, options = {}) {
    return new StorageState(key, defaultValue, options);
}
/**
 * 批量存储操作
 */
function useBatchStorage(options = {}) {
    const storage = new WebStorage(options);
    /**
     * 批量设置
     */
    const batchSet = (items, setOptions) => {
        Object.entries(items).forEach(([key, value]) => {
            storage.set(key, value, setOptions);
        });
    };
    /**
     * 批量获取
     */
    const batchGet = (keys, getOptions) => {
        const result = {};
        keys.forEach(key => {
            result[key] = storage.get(key, getOptions);
        });
        return result;
    };
    /**
     * 批量移除
     */
    const batchRemove = (keys) => {
        keys.forEach(key => {
            storage.remove(key);
        });
    };
    return {
        storage,
        batchSet,
        batchGet,
        batchRemove
    };
}

/**
 * Vue 插件
 */
const VueWebStoragePlugin = {
    install(app, options = {}) {
        const { localStorage: localOptions = {}, sessionStorage: sessionOptions = {}, globalName = '$storage' } = options;
        // 创建 localStorage 实例
        const localStorage = new WebStorage({
            type: StorageType.LOCAL,
            prefix: 'vue-local-',
            ...localOptions
        });
        // 创建 sessionStorage 实例
        const sessionStorage = new WebStorage({
            type: StorageType.SESSION,
            prefix: 'vue-session-',
            ...sessionOptions
        });
        // 全局存储实例
        const storage = {
            local: localStorage,
            session: sessionStorage,
            // 便捷方法
            setLocal: localStorage.set.bind(localStorage),
            getLocal: localStorage.get.bind(localStorage),
            removeLocal: localStorage.remove.bind(localStorage),
            clearLocal: localStorage.clear.bind(localStorage),
            setSession: sessionStorage.set.bind(sessionStorage),
            getSession: sessionStorage.get.bind(sessionStorage),
            removeSession: sessionStorage.remove.bind(sessionStorage),
            clearSession: sessionStorage.clear.bind(sessionStorage),
            // 通用方法
            set: localStorage.set.bind(localStorage),
            get: localStorage.get.bind(localStorage),
            remove: localStorage.remove.bind(localStorage),
            clear: localStorage.clear.bind(localStorage),
            has: localStorage.has.bind(localStorage),
            keys: localStorage.keys.bind(localStorage),
            clearExpired: localStorage.clearExpired.bind(localStorage),
            getStats: localStorage.getStats.bind(localStorage)
        };
        // 注册全局属性
        app.config.globalProperties[globalName] = storage;
        // 提供依赖注入
        app.provide('webStorage', storage);
        app.provide('localStorage', localStorage);
        app.provide('sessionStorage', sessionStorage);
    }
};

/**
 * Vue Web Storage - 轻量、支持类型、支持过期时间的 Web Storage 封装库
 * @author caiqianha
 * @version 1.0.0
 */
const localStorage$1 = new WebStorage({
    type: StorageType.LOCAL,
    prefix: 'vue-local-'
});
const sessionStorage$1 = new WebStorage({
    type: StorageType.SESSION,
    prefix: 'vue-session-'
});
// 版本信息
const version = '1.0.0';

export { StorageState, StorageType, VueWebStoragePlugin, WebStorage, calculateExpires, createStorageState, decrypt, deepClone, VueWebStoragePlugin as default, deserialize, encrypt, formatBytes, getStorageSize, isExpired, localStorage$1 as localStorage, serialize, sessionStorage$1 as sessionStorage, useBatchStorage, useLocalStorage, useSessionStorage, useStorage, version };
//# sourceMappingURL=vue-web-storage.esm.js.map
