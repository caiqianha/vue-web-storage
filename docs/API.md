# API 文档

本文档详细介绍了 Vue Web Storage 库的所有 API。

## 目录

- [核心类](#核心类)
  - [WebStorage](#webstorage)
  - [StorageState](#storagestate)
- [组合式 API](#组合式-api)
- [Vue 插件](#vue-插件)
- [类型定义](#类型定义)
- [工具函数](#工具函数)

## 核心类

### WebStorage

主要的存储封装类，提供完整的存储操作功能。

#### 构造函数

```typescript
constructor(options?: StorageOptions)
```

创建一个新的 WebStorage 实例。

**参数：**
- `options`: 可选的配置选项

**示例：**
```typescript
import { WebStorage, StorageType } from 'vue-web-super-storage'

const storage = new WebStorage({
  type: StorageType.LOCAL,
  prefix: 'my-app-',
  defaultExpires: 24 * 60 * 60 * 1000, // 24小时
  encrypt: true,
  encryptKey: 'my-secret'
})
```

#### 方法

##### set\<T\>(key: string, value: T, options?: SetOptions): boolean

设置存储项。

**参数：**
- `key`: 存储键名
- `value`: 要存储的值
- `options`: 可选的设置选项

**返回值：**
- `boolean`: 操作是否成功

**示例：**
```typescript
// 基本使用
storage.set('username', 'John')

// 设置过期时间
storage.set('token', 'abc123', { expires: 2 * 60 * 60 * 1000 }) // 2小时后过期

// 强制加密此项
storage.set('password', '123456', { encrypt: true })
```

##### get\<T\>(key: string, options?: GetOptions): T | null

获取存储项。

**参数：**
- `key`: 存储键名
- `options`: 可选的获取选项

**返回值：**
- `T | null`: 存储的值，如果不存在或已过期则返回 null 或默认值

**示例：**
```typescript
// 基本使用
const username = storage.get('username')

// 设置默认值
const theme = storage.get('theme', { defaultValue: 'light' })

// 类型安全
interface User {
  name: string
  age: number
}
const user = storage.get<User>('user')
```

##### has(key: string): boolean

检查存储项是否存在且未过期。

**参数：**
- `key`: 存储键名

**返回值：**
- `boolean`: 是否存在有效的存储项

**示例：**
```typescript
if (storage.has('user')) {
  console.log('用户数据存在')
} else {
  console.log('用户数据不存在或已过期')
}
```

##### remove(key: string): boolean

删除存储项。

**参数：**
- `key`: 存储键名

**返回值：**
- `boolean`: 操作是否成功

**示例：**
```typescript
storage.remove('token')
```

##### clear(): boolean

清空所有存储项（仅清理带指定前缀的项）。

**返回值：**
- `boolean`: 操作是否成功

**示例：**
```typescript
storage.clear()
```

##### clearExpired(): number

清理过期的存储项。

**返回值：**
- `number`: 清理的项目数量

**示例：**
```typescript
const clearedCount = storage.clearExpired()
console.log(`清理了 ${clearedCount} 个过期项`)
```

##### keys(): string[]

获取所有有效的键名（不包含前缀）。

**返回值：**
- `string[]`: 键名数组

**示例：**
```typescript
const allKeys = storage.keys()
console.log('所有键名:', allKeys)
```

##### getStats(): StorageStats

获取存储统计信息。

**返回值：**
- `StorageStats`: 统计信息对象

**示例：**
```typescript
const stats = storage.getStats()
console.log('总数:', stats.total)
console.log('有效:', stats.valid)
console.log('过期:', stats.expired)
console.log('使用空间:', stats.usedBytes, '字节')
```

##### on(type: StorageEventType, listener: StorageEventListener): void

添加事件监听器。

**参数：**
- `type`: 事件类型
- `listener`: 事件监听函数

**支持的事件类型：**
- `'set'`: 设置数据时触发
- `'get'`: 获取数据时触发
- `'remove'`: 删除数据时触发
- `'clear'`: 清空数据时触发
- `'expired'`: 数据过期时触发

**示例：**
```typescript
storage.on('set', (data) => {
  console.log(`设置了 ${data.key}:`, data.value)
})

storage.on('expired', (data) => {
  console.log('数据过期:', data.key)
})
```

##### off(type: StorageEventType, listener: StorageEventListener): void

移除事件监听器。

**参数：**
- `type`: 事件类型
- `listener`: 要移除的监听函数

**示例：**
```typescript
const listener = (data) => console.log(data)
storage.on('set', listener)
storage.off('set', listener) // 移除监听器
```

### StorageState

响应式存储状态管理器。

#### 构造函数

```typescript
constructor(key: string, defaultValue: T, options?: StorageOptions)
```

**示例：**
```typescript
import { StorageState } from 'vue-web-super-storage'

const userState = new StorageState('user', { name: '', age: 0 })
```

#### 属性

##### value: T

获取或设置当前值。

**示例：**
```typescript
// 获取值
console.log(userState.value)

// 设置值
userState.value = { name: 'John', age: 30 }
```

##### ref: Ref\<T\>

获取响应式引用，可在 Vue 组件中使用。

**示例：**
```typescript
import { computed } from 'vue'

const userName = computed(() => userState.ref.value.name)
```

#### 方法

##### setValue(value: T, options?: SetOptions): void

设置值（带选项）。

**示例：**
```typescript
userState.setValue({ name: 'Jane', age: 25 }, { expires: 24 * 60 * 60 * 1000 })
```

##### reset(): void

重置为默认值。

**示例：**
```typescript
userState.reset()
```

##### remove(): void

从存储中移除。

**示例：**
```typescript
userState.remove()
```

##### refresh(): void

从存储重新读取值。

**示例：**
```typescript
userState.refresh()
```

##### destroy(): void

停止监听，释放资源。

**示例：**
```typescript
userState.destroy()
```

## 组合式 API

### useStorage

通用存储 hook。

```typescript
function useStorage<T>(
  key: string,
  defaultValue?: T,
  options?: StorageOptions
): [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void]
```

**返回值：**
- `[state, setValue, removeValue]`

**示例：**
```typescript
import { useStorage, StorageType } from 'vue-web-super-storage'

const [theme, setTheme, removeTheme] = useStorage('theme', 'light', {
  type: StorageType.LOCAL,
  prefix: 'app-'
})

// 使用
setTheme('dark')
removeTheme()
```

### useLocalStorage

localStorage 专用 hook。

```typescript
function useLocalStorage<T>(
  key: string,
  defaultValue?: T,
  options?: Omit<StorageOptions, 'type'>
): [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void]
```

**示例：**
```typescript
import { useLocalStorage } from 'vue-web-super-storage'

const [user, setUser, removeUser] = useLocalStorage('user', { name: '', age: 0 })
```

### useSessionStorage

sessionStorage 专用 hook。

```typescript
function useSessionStorage<T>(
  key: string,
  defaultValue?: T,
  options?: Omit<StorageOptions, 'type'>
): [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void]
```

**示例：**
```typescript
import { useSessionStorage } from 'vue-web-super-storage'

const [tempData, setTempData, removeTempData] = useSessionStorage('temp', '')
```

### createStorageState

创建存储状态管理器。

```typescript
function createStorageState<T>(
  key: string,
  defaultValue: T,
  options?: StorageOptions
): StorageState<T>
```

**示例：**
```typescript
import { createStorageState } from 'vue-web-super-storage'

const userState = createStorageState('user', { name: '', age: 0 })
```

### useBatchStorage

批量存储操作。

```typescript
function useBatchStorage(options?: StorageOptions): {
  storage: WebStorage
  batchSet: (items: Record<string, any>, setOptions?: SetOptions) => void
  batchGet: <T>(keys: string[], getOptions?: GetOptions) => Record<string, T>
  batchRemove: (keys: string[]) => void
}
```

**示例：**
```typescript
import { useBatchStorage } from 'vue-web-super-storage'

const { batchSet, batchGet, batchRemove } = useBatchStorage()

// 批量设置
batchSet({
  username: 'John',
  theme: 'dark',
  language: 'zh'
})

// 批量获取
const data = batchGet(['username', 'theme', 'language'])

// 批量删除
batchRemove(['temp1', 'temp2', 'temp3'])
```

## Vue 插件

### VueWebStoragePlugin

Vue 3 插件，提供全局存储实例。

**安装：**
```typescript
import { createApp } from 'vue'
import VueWebStorage from 'vue-web-super-storage'

app.use(VueWebStorage, options)
```

**选项：**
```typescript
interface VueWebStorageOptions {
  localStorage?: StorageOptions
  sessionStorage?: StorageOptions
  globalName?: string
}
```

**使用：**
```typescript
// 在组件中
export default {
  mounted() {
    // 通过 this.$storage 访问
    this.$storage.setLocal('key', 'value')
    this.$storage.setSession('temp', 'data')
  }
}
```

## 类型定义

### StorageType

```typescript
enum StorageType {
  LOCAL = 'localStorage',
  SESSION = 'sessionStorage'
}
```

### StorageOptions

```typescript
interface StorageOptions {
  type?: StorageType
  defaultExpires?: number
  prefix?: string
  encrypt?: boolean
  encryptKey?: string
}
```

### SetOptions

```typescript
interface SetOptions {
  expires?: number
  encrypt?: boolean
}
```

### GetOptions

```typescript
interface GetOptions {
  defaultValue?: any
}
```

### StorageStats

```typescript
interface StorageStats {
  total: number
  expired: number
  valid: number
  usedBytes: number
}
```

### StorageEventData

```typescript
interface StorageEventData {
  type: StorageEventType
  key?: string
  value?: any
  timestamp: number
}
```

## 工具函数

### encrypt(text: string, key?: string): string

加密文本。

### decrypt(encryptedText: string, key?: string): string

解密文本。

### isExpired(expires: number | null): boolean

检查是否过期。

### calculateExpires(expires?: number): number | null

计算过期时间。

### formatBytes(bytes: number): string

格式化字节数显示。

**示例：**
```typescript
import { formatBytes } from 'vue-web-super-storage'

console.log(formatBytes(1024)) // "1 KB"
console.log(formatBytes(1048576)) // "1 MB"
```

### deepClone\<T\>(obj: T): T

深拷贝对象。

**示例：**
```typescript
import { deepClone } from 'vue-web-super-storage'

const original = { user: { name: 'John', settings: { theme: 'dark' } } }
const copy = deepClone(original)
```
