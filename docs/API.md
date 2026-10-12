# API 文档

`vue-web-super-storage` 的完整参考。快速上手请看 [README](../README.md)，版本差异见 [CHANGELOG](../CHANGELOG.md)。

## 目录

- [核心类](#核心类)
  - [WebStorage](#webstorage)
  - [StorageState](#storagestate)
- [组合式 API](#组合式-api)
- [Vue 插件](#vue-插件)
- [便捷实例与版本号](#便捷实例与版本号)
- [类型定义](#类型定义)
- [工具函数](#工具函数)
- [存储格式](#存储格式)
- [SSR 行为](#ssr-行为)

## 核心类

### WebStorage

主要的存储封装类，不依赖 Vue，可单独使用。

#### 构造函数

```ts
new WebStorage(options?: StorageOptions)
```

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `type` | `StorageType` | `StorageType.LOCAL` | `localStorage` 或 `sessionStorage` |
| `prefix` | `string` | `'vue-storage-'` | key 前缀，用于命名空间隔离 |
| `defaultExpires` | `number` | `0` | 默认过期时间（毫秒），`0` 表示永不过期；非法值抛 `TypeError` |
| `encrypt` | `boolean` | `false` | 是否默认混淆每一项（XOR + Base64，非加密） |
| `encryptKey` | `string` | `'vue-web-storage'` | 混淆密钥 |
| `autoCleanup` | `boolean` | `true` | 首次访问时清理一次过期项（每个 `(type, prefix)` 每次页面加载只做一次） |
| `cleanupInterval` | `number` | `0` | 定时清理间隔（毫秒），`0` 不开启；同一 `(type, prefix)` 只会有一个定时器 |

构造函数不会访问 `window` / `localStorage`，因此在 SSR 下可以安全实例化。

```ts
import { WebStorage, StorageType } from 'vue-web-super-storage'

const storage = new WebStorage({
  type: StorageType.LOCAL,
  prefix: 'my-app-',
  defaultExpires: 24 * 60 * 60 * 1000,
  cleanupInterval: 60 * 1000
})
```

#### 过期时间的取值规则

所有表示时长的参数（`expires`、`defaultExpires`、`cleanupInterval`）：

- `undefined`、`null`、`0`：永不过期 / 不开启
- 正的有限数：毫秒
- `NaN`、负数、`Infinity`、非数字：抛出 `TypeError`（不会写入任何数据）

#### set\<T\>(key, value, options?): boolean

写入一项。

- `options.expires`：过期毫秒数，覆盖 `defaultExpires`；传 `0` 可以把开启了默认过期的实例改成永不过期
- `options.encrypt`：是否混淆此项，覆盖实例级 `encrypt`

返回 `true` 表示写入成功；写入失败（配额不足、非浏览器环境等）返回 `false`；`expires` 非法时抛 `TypeError`。

```ts
storage.set('username', 'John')
storage.set('token', 'abc123', { expires: 2 * 60 * 60 * 1000 })
storage.set('secret', { pin: '1234' }, { encrypt: true }) // 只混淆这一项
storage.set('forever', 1, { expires: 0 })                 // 忽略 defaultExpires
```

单项混淆的数据带有自描述标记，读取时无需实例开启 `encrypt`，只要 `encryptKey` 一致即可。

#### get\<T\>(key, options?): T | null

读取一项。不存在、已过期、无法解析时返回 `options.defaultValue ?? null`；过期项会被顺手删除并触发 `expired` 事件。

```ts
const username = storage.get<string>('username')
const theme = storage.get('theme', { defaultValue: 'light' })
```

#### has(key): boolean

是否存在且未过期（过期项会被删除）。

#### remove(key): boolean

删除一项。

#### clear(): boolean

删除当前前缀下的所有项，不影响其他前缀和无前缀的数据。

#### clearExpired(): number

删除当前前缀下的所有过期项，返回删除数量。

#### keys(): string[]

当前前缀下所有有效项的 key（不含前缀）。

#### getAll\<T\>(): Record\<string, T\>

当前前缀下所有有效项，`{ key: value }` 形式。

#### getStats(): StorageStats

统计信息，不会删除过期项。

| 属性 | 说明 |
| --- | --- |
| `total` | 当前前缀下的项目数 |
| `expired` | 其中已过期的数量 |
| `valid` | 有效数量 |
| `usedBytes` | key + 原始值的长度之和（UTF-16 码元数，近似字节） |

#### on(type, listener) / off(type, listener)

事件监听。事件类型：`'set' | 'get' | 'remove' | 'clear' | 'expired'`，回调参数为 `StorageEventData`。

```ts
const listener = (e: StorageEventData) => console.log(e.type, e.key, e.value)
storage.on('set', listener)
storage.off('set', listener)
```

#### getFullKey(key): string

返回带前缀的完整 key（监听原生 `storage` 事件时有用）。

#### getStorage(): Storage | null

返回原生 `Storage` 对象；非浏览器环境或 storage 被禁用时返回 `null`。

#### getOptions(): Readonly\<Required\<StorageOptions\>\>

返回合并默认值后的配置副本。

#### destroy(): void

清除本实例作用域（`type + prefix`）上的定时清理器并移除所有事件监听。

### StorageState

面向对象风格的响应式状态，内部与 `useStorage` 共用同一套实现。

```ts
import { createStorageState } from 'vue-web-super-storage'

const userState = createStorageState('user', { name: '', age: 0 }, { prefix: 'app-' })
```

| 成员 | 说明 |
| --- | --- |
| `value: T` | 读写当前值，写入立即同步到 storage |
| `ref: Ref<T>` | 响应式引用 |
| `storage: WebStorage` | 底层实例 |
| `setValue(value, options?)` | 带选项写入；之后对 `value` / `ref` 的修改沿用同一组选项 |
| `remove()` | 从 storage 删除并把状态重置为默认值，不会写回默认值 |
| `reset()` | 同 `remove()` |
| `refresh()` | 从 storage 重新读取 |
| `destroy()` | 停止监听（watch 与跨标签页同步） |

构造函数第三个参数是 `UseStorageOptions`，支持 `syncAcrossTabs`。

## 组合式 API

### useStorage\<T\>(key, defaultValue?, options?): UseStorageReturn\<T\>

```ts
import { useStorage, StorageType } from 'vue-web-super-storage'

const [theme, setTheme, removeTheme] = useStorage('theme', 'light', { type: StorageType.LOCAL })
```

行为：

- 初始值取 storage 中的有效值，否则取 `defaultValue`（默认值不会主动写入 storage）
- 对 ref 的赋值和深层修改会**同步**写入 storage，并沿用最近一次 `setValue` 传入的 `expires` / `encrypt`
- `setValue(value, options?)` 写入并记住选项
- `removeValue()` 删除 key 并把 ref 重置为默认值，不会把默认值写回
- `options.syncAcrossTabs`（默认 `true`）：监听 `window` 的 `storage` 事件，其他标签页修改同一 key 时刷新 ref；对方 `clear()` 时回到默认值
- 在组件 / `effectScope` 内调用会在作用域销毁时自动停止监听；在外部调用也不会产生警告，可手动调用 `stop()`

返回值兼容 1.0.x 的三元组 `[state, setValue, removeValue]`，同时带有具名属性：

```ts
const result = useStorage('cart', [])
result.state      // Ref<T>
result.setValue   // (value, options?) => void
result.removeValue
result.refresh    // 从 storage 重新读取
result.stop       // 停止 watch 和跨标签页监听
result.storage    // WebStorage 实例
```

### useLocalStorage / useSessionStorage

与 `useStorage` 相同，只是固定了 `type`，`options` 为 `Omit<UseStorageOptions, 'type'>`。

### createStorageState\<T\>(key, defaultValue, options?): StorageState\<T\>

见 [StorageState](#storagestate)。

### useBatchStorage(options?)

```ts
const { storage, batchSet, batchGet, batchRemove } = useBatchStorage({ prefix: 'app-' })

batchSet({ username: 'John', theme: 'dark' }, { expires: 3600_000 })
batchGet<string>(['username', 'theme', 'missing']) // { username: 'John', theme: 'dark', missing: null }
batchRemove(['username'])
```

## Vue 插件

### 安装

```ts
import { createApp } from 'vue'
import VueWebStorage from 'vue-web-super-storage' // 也可以 import { VueWebStoragePlugin }

app.use(VueWebStorage, {
  localStorage: { prefix: 'my-app-' },      // Omit<StorageOptions, 'type'>
  sessionStorage: { prefix: 'my-session-' },
  globalName: '$storage'                    // 挂到 globalProperties 的名字
})
```

未传 `prefix` 时两个实例都使用默认前缀 `'vue-storage-'`，与组合式 API 一致。

### 注入

插件会用 Symbol 和字符串两种 key 提供同一组对象：

| InjectionKey（推荐，带类型） | 字符串 key（1.0.x 兼容） | 值 |
| --- | --- | --- |
| `WEB_STORAGE_KEY` | `'webStorage'` | `StorageApi` |
| `LOCAL_STORAGE_KEY` | `'localStorage'` | `WebStorage`（local） |
| `SESSION_STORAGE_KEY` | `'sessionStorage'` | `WebStorage`（session） |

```ts
import { inject } from 'vue'
import { useWebStorage, WEB_STORAGE_KEY, LOCAL_STORAGE_KEY } from 'vue-web-super-storage'

const api = useWebStorage()           // 未安装插件时抛错
const same = inject(WEB_STORAGE_KEY)  // StorageApi | undefined
const local = inject(LOCAL_STORAGE_KEY)
```

选项式 API 中通过 `this.$storage` 访问（类型由 `declare module 'vue'` 增强，需要 Vue ≥ 3.3 才有类型提示，运行时不受限）。

### StorageApi

```ts
interface StorageApi {
  local: WebStorage
  session: WebStorage

  setLocal<T>(key: string, value: T, options?: SetOptions): boolean
  getLocal<T>(key: string, options?: GetOptions<T>): T | null
  removeLocal(key: string): boolean
  clearLocal(): boolean

  setSession<T>(key: string, value: T, options?: SetOptions): boolean
  getSession<T>(key: string, options?: GetOptions<T>): T | null
  removeSession(key: string): boolean
  clearSession(): boolean

  // 以下方法操作 local 实例
  set<T>(key: string, value: T, options?: SetOptions): boolean
  get<T>(key: string, options?: GetOptions<T>): T | null
  remove(key: string): boolean
  clear(): boolean
  has(key: string): boolean
  keys(): string[]
  clearExpired(): number
  getStats(): StorageStats
}
```

`createStorageApi(local, session)` 可以用自己的两个实例组装同样结构的对象。

## 便捷实例与版本号

```ts
import { local, session, version } from 'vue-web-super-storage'

local.set('k', 1)      // localStorage，默认前缀
session.get('k')       // sessionStorage，默认前缀
version                // 与 package.json 一致，构建时注入
```

`localStorage` / `sessionStorage` 两个具名导出与 `local` / `session` 是同一对象，因与全局变量同名已标记为 deprecated，仅为兼容 1.0.x 保留。

另有 `DEFAULT_PREFIX`（`'vue-storage-'`）、`isBrowser()`、`resolveNativeStorage(type)` 导出。

## 类型定义

```ts
enum StorageType { LOCAL = 'localStorage', SESSION = 'sessionStorage' }

interface StorageOptions {
  type?: StorageType
  defaultExpires?: number
  prefix?: string
  encrypt?: boolean
  encryptKey?: string
  autoCleanup?: boolean
  cleanupInterval?: number
}

interface UseStorageOptions extends StorageOptions {
  syncAcrossTabs?: boolean
}

interface SetOptions { expires?: number; encrypt?: boolean }
interface GetOptions<T = any> { defaultValue?: T }

interface StorageItem<T = any> { value: T; expires: number | null; created: number }
interface EncryptedEnvelope { vws: 1; encrypted: true; data: string }

interface StorageStats { total: number; expired: number; valid: number; usedBytes: number }

type StorageEventType = 'set' | 'get' | 'remove' | 'clear' | 'expired'
interface StorageEventData { type: StorageEventType; key?: string; value?: any; timestamp: number }
type StorageEventListener = (data: StorageEventData) => void

type UseStorageReturn<T> = [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void] & {
  state: Ref<T>
  setValue: (value: T, setOptions?: SetOptions) => void
  removeValue: () => void
  refresh: () => void
  stop: () => void
  storage: WebStorage
}
```

## 工具函数

| 函数 | 说明 |
| --- | --- |
| `encrypt(text, key?)` | UTF-8 编码后与密钥逐字节 XOR，再 Base64。**混淆而非加密** |
| `decrypt(text, key?)` | 逆向 `encrypt`；失败时尝试 1.0.x 旧算法；都失败返回原文 |
| `decryptLegacy(text, key?)` | 1.0.x 的解码算法（按 UTF-16 码元 XOR，仅 Latin-1） |
| `isExpired(expires)` | 时间戳是否已过期，`null` 视为永不过期 |
| `normalizeExpires(value, name?)` | 校验时长参数，返回 `null`（永不过期）或毫秒数，非法抛 `TypeError` |
| `calculateExpires(expires?)` | 返回绝对过期时间戳或 `null` |
| `serialize(data, encrypt?, key?)` / `deserialize(text, encrypted?, key?)` | JSON（可选混淆）序列化 |
| `getStorageSize(storage)` | 原生 `Storage` 占用的码元数 |
| `formatBytes(bytes)` | `1024 → '1 KB'` |
| `deepClone(obj)` | 优先 `structuredClone`，遇到响应式代理等不可克隆对象时回退到递归拷贝 |

## 存储格式

每个 key 在原生 storage 中存一条字符串：

```jsonc
// 明文项
{"value":{"name":"John"},"expires":1735689600000,"created":1735603200000}

// 混淆项（实例级或单项级 encrypt）
{"vws":1,"encrypted":true,"data":"<base64>"}   // data 解码后即上面的明文项
```

1.0.x 写出的混淆项没有外层信封（整串是 Base64）。1.1.0 读取时会依次尝试：JSON 明文 → 带标记的信封 → 旧格式新算法 → 旧格式旧算法，因此旧数据无需迁移；但 1.1.0 写出的混淆项 1.0.x 读不了。

## SSR 行为

- import 本库不会访问 `window` / `localStorage`
- `new WebStorage()`、`useStorage()`、`createStorageState()` 在服务端可以正常调用
- 没有 DOM 时：`set` / `remove` / `clear` 返回 `false`，`get` 返回 `defaultValue ?? null`，`has` 返回 `false`，`keys()` 返回 `[]`，`getStorage()` 返回 `null`，`clearExpired()` 返回 `0`
- 组合式 API 的 ref 在服务端保持默认值，不会注册 `storage` 事件监听
