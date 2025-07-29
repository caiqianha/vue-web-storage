# Vue Web Storage

一个轻量、支持类型、支持过期时间的 Vue 3 Web Storage 封装库。

[![npm version](https://img.shields.io/npm/v/vue-web-storage.svg)](https://www.npmjs.com/package/vue-web-storage)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.x-green.svg)](https://vuejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ 特性

- 🎯 **TypeScript 支持** - 完整的类型定义和类型安全
- ⏰ **过期时间** - 支持设置数据过期时间，自动清理过期数据
- 🔄 **响应式** - 提供 Vue 3 组合式 API，数据变化自动同步
- 🔐 **加密存储** - 可选的数据加密功能
- 📦 **轻量级** - 无依赖，打包后仅几 KB
- 🎭 **双存储支持** - 同时支持 localStorage 和 sessionStorage
- 🎪 **事件监听** - 监听存储操作事件
- 📊 **统计信息** - 获取存储使用统计
- 🧹 **自动清理** - 自动清理过期数据
- 🔧 **灵活配置** - 支持前缀、默认过期时间等配置

## 📦 安装

```bash
npm install vue-web-super-storage
# 或
yarn add vue-web-super-storage
# 或
pnpm add vue-web-super-storage
```

## 🚀 快速开始

### 作为 Vue 插件使用

```typescript
import { createApp } from 'vue'
import VueWebStorage from 'vue-web-storage'
import App from './App.vue'

const app = createApp(App)

app.use(VueWebStorage, {
  localStorage: {
    prefix: 'my-app-',
    defaultExpires: 7 * 24 * 60 * 60 * 1000 // 7天
  },
  sessionStorage: {
    prefix: 'my-session-'
  }
})

app.mount('#app')
```

在组件中使用：

```vue
<template>
  <div>
    <input v-model="username" placeholder="用户名" />
    <button @click="saveUser">保存</button>
  </div>
</template>

<script setup>
import { ref, getCurrentInstance } from 'vue'

const { proxy } = getCurrentInstance()
const username = ref('')

const saveUser = () => {
  // 保存到 localStorage，7天后过期
  proxy.$storage.setLocal('username', username.value, {
    expires: 7 * 24 * 60 * 60 * 1000
  })
  
  // 保存到 sessionStorage
  proxy.$storage.setSession('temp-data', 'some data')
}
</script>
```

### 使用组合式 API

```vue
<template>
  <div>
    <input v-model="username" placeholder="用户名" />
    <p>当前用户: {{ username }}</p>
  </div>
</template>

<script setup>
import { useLocalStorage } from 'vue-web-storage'

// 响应式 localStorage，数据变化自动保存
const [username, setUsername, removeUsername] = useLocalStorage('username', '默认用户名')

// 设置带过期时间的值
setUsername('新用户名', { expires: 24 * 60 * 60 * 1000 }) // 24小时后过期

// 移除值
// removeUsername()
</script>
```

### 直接使用存储类

```typescript
import { WebStorage, StorageType } from 'vue-web-storage'

// 创建 localStorage 实例
const storage = new WebStorage({
  type: StorageType.LOCAL,
  prefix: 'my-app-',
  defaultExpires: 24 * 60 * 60 * 1000, // 默认24小时过期
  encrypt: true, // 启用加密
  encryptKey: 'my-secret-key'
})

// 设置值
storage.set('user', { name: 'John', age: 30 })

// 设置带过期时间的值
storage.set('token', 'abc123', { expires: 2 * 60 * 60 * 1000 }) // 2小时后过期

// 获取值
const user = storage.get('user')
const token = storage.get('token', { defaultValue: 'default-token' })

// 检查是否存在
if (storage.has('user')) {
  console.log('用户数据存在')
}

// 删除值
storage.remove('token')

// 清空所有数据
storage.clear()

// 清理过期数据
const expiredCount = storage.clearExpired()
console.log(`清理了 ${expiredCount} 个过期项`)

// 获取统计信息
const stats = storage.getStats()
console.log('存储统计:', stats)
```

## 📚 API 文档

### WebStorage 类

#### 构造函数

```typescript
new WebStorage(options?: StorageOptions)
```

**StorageOptions:**

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| type | `StorageType` | `StorageType.LOCAL` | 存储类型 (localStorage/sessionStorage) |
| prefix | `string` | `'vue-storage-'` | key 前缀 |
| defaultExpires | `number` | `0` | 默认过期时间(毫秒)，0 表示永不过期 |
| encrypt | `boolean` | `false` | 是否启用加密 |
| encryptKey | `string` | `'vue-web-storage'` | 加密密钥 |

#### 方法

##### set(key, value, options?)

设置存储项。

```typescript
storage.set<T>(key: string, value: T, options?: SetOptions): boolean
```

**SetOptions:**

| 参数 | 类型 | 描述 |
|------|------|------|
| expires | `number` | 过期时间(毫秒) |
| encrypt | `boolean` | 是否加密此项 |

##### get(key, options?)

获取存储项。

```typescript
storage.get<T>(key: string, options?: GetOptions): T | null
```

**GetOptions:**

| 参数 | 类型 | 描述 |
|------|------|------|
| defaultValue | `any` | 默认值 |

##### has(key)

检查存储项是否存在且未过期。

```typescript
storage.has(key: string): boolean
```

##### remove(key)

删除存储项。

```typescript
storage.remove(key: string): boolean
```

##### clear()

清空所有存储项。

```typescript
storage.clear(): boolean
```

##### clearExpired()

清理过期的存储项。

```typescript
storage.clearExpired(): number
```

##### keys()

获取所有键名。

```typescript
storage.keys(): string[]
```

##### getStats()

获取存储统计信息。

```typescript
storage.getStats(): StorageStats
```

**StorageStats:**

| 属性 | 类型 | 描述 |
|------|------|------|
| total | `number` | 总项目数 |
| expired | `number` | 已过期项目数 |
| valid | `number` | 有效项目数 |
| usedBytes | `number` | 使用的存储空间(字节) |

### 组合式 API

#### useStorage(key, defaultValue?, options?)

通用存储 hook。

```typescript
function useStorage<T>(
  key: string,
  defaultValue?: T,
  options?: StorageOptions
): [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void]
```

返回值：`[state, setValue, removeValue]`

#### useLocalStorage(key, defaultValue?, options?)

localStorage hook。

```typescript
function useLocalStorage<T>(
  key: string,
  defaultValue?: T,
  options?: Omit<StorageOptions, 'type'>
): [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void]
```

#### useSessionStorage(key, defaultValue?, options?)

sessionStorage hook。

```typescript
function useSessionStorage<T>(
  key: string,
  defaultValue?: T,
  options?: Omit<StorageOptions, 'type'>
): [Ref<T>, (value: T, setOptions?: SetOptions) => void, () => void]
```

#### createStorageState(key, defaultValue, options?)

创建存储状态管理器。

```typescript
function createStorageState<T>(
  key: string,
  defaultValue: T,
  options?: StorageOptions
): StorageState<T>
```

### 事件监听

```typescript
// 监听存储事件
storage.on('set', (data) => {
  console.log('数据已设置:', data)
})

storage.on('get', (data) => {
  console.log('数据已获取:', data)
})

storage.on('remove', (data) => {
  console.log('数据已删除:', data)
})

storage.on('expired', (data) => {
  console.log('数据已过期:', data)
})

// 移除事件监听
storage.off('set', listener)
```

## 🔐 加密功能

库提供了简单的加密功能（基于 XOR 和 Base64），适用于一般的数据保护需求：

```typescript
const storage = new WebStorage({
  encrypt: true,
  encryptKey: 'your-secret-key'
})

// 数据将被自动加密存储
storage.set('sensitive-data', { password: '123456' })
```

**注意：** 内置加密仅适用于防止普通的数据泄露，对于高安全需求，建议使用专业的加密库。

## 📱 浏览器兼容性

- Chrome ≥ 51
- Firefox ≥ 54
- Safari ≥ 10
- Edge ≥ 12
- IE ≥ 11

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](LICENSE)

## 📞 支持

如果这个库对你有帮助，请给一个 ⭐️ Star！

如有问题，请提交 [Issue](https://github.com/caiqianha/vue-web-storage/issues)。
