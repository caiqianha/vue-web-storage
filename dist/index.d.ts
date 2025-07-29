import { Ref, App } from 'vue';

/**
 * Storage 类型枚举
 */
declare enum StorageType {
    LOCAL = "localStorage",
    SESSION = "sessionStorage"
}
/**
 * 存储项的接口
 */
interface StorageItem<T = any> {
    /** 存储的值 */
    value: T;
    /** 过期时间戳（毫秒），如果为 null 则永不过期 */
    expires: number | null;
    /** 创建时间戳 */
    created: number;
}
/**
 * Storage 配置选项
 */
interface StorageOptions {
    /** Storage 类型，默认为 localStorage */
    type?: StorageType;
    /** 默认过期时间（毫秒），如果不设置则永不过期 */
    defaultExpires?: number;
    /** key 前缀，用于避免命名冲突 */
    prefix?: string;
    /** 是否启用加密存储 */
    encrypt?: boolean;
    /** 加密密钥 */
    encryptKey?: string;
}
/**
 * 设置存储项的选项
 */
interface SetOptions {
    /** 过期时间（毫秒） */
    expires?: number;
    /** 是否加密此项 */
    encrypt?: boolean;
}
/**
 * 获取存储项的选项
 */
interface GetOptions {
    /** 默认值，当存储项不存在或已过期时返回 */
    defaultValue?: any;
}
/**
 * Storage 统计信息
 */
interface StorageStats {
    /** 总项目数 */
    total: number;
    /** 已过期项目数 */
    expired: number;
    /** 有效项目数 */
    valid: number;
    /** 使用的存储空间（字节） */
    usedBytes: number;
}
/**
 * Storage 事件类型
 */
type StorageEventType = 'set' | 'get' | 'remove' | 'clear' | 'expired';
/**
 * Storage 事件数据
 */
interface StorageEventData {
    type: StorageEventType;
    key?: string;
    value?: any;
    timestamp: number;
}
/**
 * Storage 事件监听器
 */
type StorageEventListener = (data: StorageEventData) => void;

/**
 * WebStorage 封装类
 */
declare class WebStorage {
    private storage;
    private options;
    private listeners;
    constructor(options?: StorageOptions);
    /**
     * 生成完整的 key
     */
    private getFullKey;
    /**
     * 触发事件
     */
    private emit;
    /**
     * 设置存储项
     */
    set<T = any>(key: string, value: T, options?: SetOptions): boolean;
    /**
     * 获取存储项
     */
    get<T = any>(key: string, options?: GetOptions): T | null;
    /**
     * 检查存储项是否存在且未过期
     */
    has(key: string): boolean;
    /**
     * 删除存储项
     */
    remove(key: string): boolean;
    /**
     * 清空所有存储项（只清理带前缀的）
     */
    clear(): boolean;
    /**
     * 清理过期的存储项
     */
    clearExpired(): number;
    /**
     * 获取所有键名（不包含前缀）
     */
    keys(): string[];
    /**
     * 获取存储统计信息
     */
    getStats(): StorageStats;
    /**
     * 添加事件监听器
     */
    on(type: StorageEventType, listener: StorageEventListener): void;
    /**
     * 移除事件监听器
     */
    off(type: StorageEventType, listener: StorageEventListener): void;
    /**
     * 获取原始 Storage 对象
     */
    getStorage(): Storage;
    /**
     * 获取配置选项
     */
    getOptions(): Readonly<Required<StorageOptions>>;
}

/**
 * 简单的加密函数（基于 Base64 和简单的字符偏移）
 * 注意：这只是演示用的简单加密，实际项目建议使用更安全的加密方式
 */
declare function encrypt(text: string, key?: string): string;
/**
 * 简单的解密函数
 */
declare function decrypt(encryptedText: string, key?: string): string;
/**
 * 检查是否过期
 */
declare function isExpired(expires: number | null): boolean;
/**
 * 计算过期时间
 */
declare function calculateExpires(expires?: number): number | null;
/**
 * 序列化数据
 */
declare function serialize(data: any, shouldEncrypt?: boolean, encryptKey?: string): string;
/**
 * 反序列化数据
 */
declare function deserialize(data: string, encrypted?: boolean, encryptKey?: string): any;
/**
 * 获取存储占用的字节数
 */
declare function getStorageSize(storage: Storage): number;
/**
 * 格式化字节数
 */
declare function formatBytes(bytes: number): string;
/**
 * 深拷贝对象
 */
declare function deepClone<T>(obj: T): T;

/**
 * 响应式存储组合函数
 */
declare function useStorage<T = any>(key: string, defaultValue?: T, options?: StorageOptions): [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void];
/**
 * localStorage 组合函数
 */
declare function useLocalStorage<T = any>(key: string, defaultValue?: T, options?: Omit<StorageOptions, 'type'>): [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void];
/**
 * sessionStorage 组合函数
 */
declare function useSessionStorage<T = any>(key: string, defaultValue?: T, options?: Omit<StorageOptions, 'type'>): [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void];
/**
 * 存储状态管理器
 */
declare class StorageState<T = any> {
    private key;
    private defaultValue;
    private storage;
    private state;
    private stopWatcher?;
    constructor(key: string, defaultValue: T, options?: StorageOptions);
    /**
     * 开始监听状态变化
     */
    private startWatching;
    /**
     * 获取当前值
     */
    get value(): T;
    /**
     * 设置值
     */
    set value(newValue: T);
    /**
     * 获取响应式引用
     */
    get ref(): Ref<T>;
    /**
     * 设置值（带选项）
     */
    setValue(value: T, options?: SetOptions): void;
    /**
     * 重置为默认值
     */
    reset(): void;
    /**
     * 从存储中移除
     */
    remove(): void;
    /**
     * 刷新值（从存储重新读取）
     */
    refresh(): void;
    /**
     * 停止监听
     */
    destroy(): void;
}
/**
 * 创建存储状态
 */
declare function createStorageState<T = any>(key: string, defaultValue: T, options?: StorageOptions): StorageState<T>;
/**
 * 批量存储操作
 */
declare function useBatchStorage(options?: StorageOptions): {
    storage: WebStorage;
    batchSet: (items: Record<string, any>, setOptions?: SetOptions) => void;
    batchGet: <T = any>(keys: string[], getOptions?: GetOptions) => Record<string, T>;
    batchRemove: (keys: string[]) => void;
};

/**
 * Vue 插件选项
 */
interface VueWebStorageOptions {
    /** localStorage 配置 */
    localStorage?: StorageOptions;
    /** sessionStorage 配置 */
    sessionStorage?: StorageOptions;
    /** 全局实例名称 */
    globalName?: string;
}
/**
 * Vue 插件
 */
declare const VueWebStoragePlugin: {
    install(app: App, options?: VueWebStorageOptions): void;
};
/**
 * 声明全局类型
 */
declare module '@vue/runtime-core' {
    interface ComponentCustomProperties {
        $storage: {
            local: WebStorage;
            session: WebStorage;
            setLocal: <T>(key: string, value: T, options?: any) => boolean;
            getLocal: <T>(key: string, options?: any) => T | null;
            removeLocal: (key: string) => boolean;
            clearLocal: () => boolean;
            setSession: <T>(key: string, value: T, options?: any) => boolean;
            getSession: <T>(key: string, options?: any) => T | null;
            removeSession: (key: string) => boolean;
            clearSession: () => boolean;
            set: <T>(key: string, value: T, options?: any) => boolean;
            get: <T>(key: string, options?: any) => T | null;
            remove: (key: string) => boolean;
            clear: () => boolean;
            has: (key: string) => boolean;
            keys: () => string[];
            clearExpired: () => number;
            getStats: () => any;
        };
    }
}

/**
 * Vue Web Storage - 轻量、支持类型、支持过期时间的 Web Storage 封装库
 * @author caiqianha
 * @version 1.0.0
 */

declare const localStorage: WebStorage;
declare const sessionStorage: WebStorage;
declare const version = "1.0.0";

export { StorageState, StorageType, VueWebStoragePlugin, WebStorage, calculateExpires, createStorageState, decrypt, deepClone, VueWebStoragePlugin as default, deserialize, encrypt, formatBytes, getStorageSize, isExpired, localStorage, serialize, sessionStorage, useBatchStorage, useLocalStorage, useSessionStorage, useStorage, version };
export type { GetOptions, SetOptions, StorageEventData, StorageEventListener, StorageEventType, StorageItem, StorageOptions, StorageStats, VueWebStorageOptions };
