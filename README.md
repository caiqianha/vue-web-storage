# vue-web-super-storage

> Typed `localStorage` / `sessionStorage` for Vue 3 with per-key TTL, namespaces, optional obfuscation, cross-tab sync, and three ways to use it: plugin, composable, or plain class.

[![npm version](https://img.shields.io/npm/v/vue-web-super-storage.svg)](https://www.npmjs.com/package/vue-web-super-storage)
[![CI](https://github.com/caiqianha/vue-web-storage/actions/workflows/test.yml/badge.svg)](https://github.com/caiqianha/vue-web-storage/actions/workflows/test.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.x-green.svg)](https://vuejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**npm package: `vue-web-super-storage`** (the GitHub repository is named `vue-web-storage`).
It is not related to the npm package `vue-web-storage`.

[中文文档](#中文文档) · [Full API reference](docs/API.md) · [Changelog](CHANGELOG.md)

## Why not just VueUse `useStorage`?

VueUse's `useStorage` is great for "keep this ref in localStorage". This library covers the next
set of needs that usually end up as hand-written helpers:

- **Per-key TTL with automatic cleanup** – `set('token', t, { expires: 3600_000 })`; expired
  entries are dropped on read and swept once per page load (or on an interval you choose).
- **Namespaces** – every instance has a `prefix`; `clear()` and `keys()` only touch its own keys.
- **Obfuscation toggle** – per instance or per item (`{ encrypt: true }`). XOR + Base64, UTF-8 safe.
  Not cryptography, see [the note below](#about-encrypt).
- **Three entry points, one store** – Vue plugin (`$storage` / `inject`), composables
  (`useLocalStorage`), and a framework-free `WebStorage` class, all sharing the same default prefix.
- **Cross-tab sync** – composable refs follow changes made in other tabs.
- **Typed end to end** – generics on `get`/`set`, `InjectionKey`s for `inject`, typed `$storage`.
- **SSR safe** – importing on the server does not touch `window`; calls become harmless no-ops.
- Zero runtime dependencies, Vue 3 is a peer dependency.

## Install

```bash
npm install vue-web-super-storage
# pnpm add vue-web-super-storage / yarn add vue-web-super-storage
```

## 30-second tour

```ts
// 1. Composable – a ref that lives in localStorage
import { useLocalStorage } from 'vue-web-super-storage'

const [theme, setTheme, removeTheme] = useLocalStorage('theme', 'light')
theme.value = 'dark'                              // written immediately
setTheme('dark', { expires: 7 * 24 * 3600_000 })  // same, with a 7-day TTL
removeTheme()                                     // deletes the key, ref back to 'light'
```

```ts
// 2. Plain class – no Vue needed
import { WebStorage, StorageType } from 'vue-web-super-storage'

const cache = new WebStorage({ type: StorageType.SESSION, prefix: 'shop-', defaultExpires: 600_000 })
cache.set('cart', { items: [] })
cache.get<{ items: unknown[] }>('cart')           // typed, null when missing or expired
cache.set('secret', 'value', { encrypt: true })   // obfuscate just this item
```

```ts
// 3. Plugin – one shared instance for the whole app
import { createApp } from 'vue'
import VueWebStorage, { useWebStorage, WEB_STORAGE_KEY } from 'vue-web-super-storage'

createApp(App)
  .use(VueWebStorage, { localStorage: { prefix: 'my-app-' } })
  .mount('#app')

// inside <script setup>
const storage = useWebStorage()          // or inject(WEB_STORAGE_KEY)
storage.setLocal('user', { id: 1 }, { expires: 86_400_000 })
// Options API: this.$storage.getLocal('user')
```

The full list of methods, options and types is in [docs/API.md](docs/API.md).

## Good to know

### Default prefix

All entry points default to `prefix: 'vue-storage-'`, so a value written through the plugin is
visible to `useLocalStorage` and vice versa. Pass your own `prefix` to isolate features or apps.

### TTL rules

`expires` / `defaultExpires` are milliseconds. `0` or omitted means "never expires". `NaN`,
negative and non-finite values throw a `TypeError` so a broken calculation cannot silently create
an immortal token.

### About `encrypt`

`encrypt: true` applies **XOR with your key followed by Base64**. It only stops someone from
reading the plain text in DevTools; it is **not cryptographic security** and the key ships with
your frontend bundle. For anything sensitive, keep it off the client or use the Web Crypto API.

### Cross-tab sync

`useStorage` / `useLocalStorage` / `useSessionStorage` / `StorageState` listen to the window
`storage` event and refresh the ref when another tab changes the same key. Disable with
`{ syncAcrossTabs: false }`.

### Expired-item cleanup

Nothing is scanned when you create an instance. On first access each `(type, prefix)` pair is
swept once per page load. `autoCleanup: false` turns that off; `cleanupInterval: 60_000` adds a
periodic sweep (one timer per prefix). `clearExpired()` is always available for manual use.

### SSR

Importing the library on the server is safe. Without a DOM, writes return `false`, reads return
`defaultValue ?? null` and `getStorage()` returns `null`. Composables simply hold the default
value until they run in the browser.

### Browser support

The build targets **ES2020** and depends on Vue 3, which means Chrome / Edge 80+, Firefox 74+,
Safari 13.1+ and any evergreen browser. Internet Explorer is not supported (neither by Vue 3).

### Upgrading from 1.0.x

1.1.0 keeps the 1.0 API but changes a few behaviours (default prefix for the plugin, real
removal in composables, TTL validation, new obfuscation format that still reads old data).
See [CHANGELOG.md](CHANGELOG.md) for the list and migration notes.

---

# 中文文档

一个轻量、类型安全、支持过期时间的 Vue 3 Web Storage 封装库。npm 包名是
**`vue-web-super-storage`**（仓库名叫 `vue-web-storage`，与 npm 上的 `vue-web-storage` 包无关）。

本节只保留安装与快速上手，完整的方法 / 选项 / 类型说明见 [docs/API.md](docs/API.md)，
版本变更与迁移说明见 [CHANGELOG.md](CHANGELOG.md)。

## 特性

- 完整 TypeScript 类型：`get` / `set` 泛型、`InjectionKey`、`this.$storage` 类型
- 每个 key 独立的过期时间，读取时自动剔除过期项，并按前缀每次页面加载清理一次
- `prefix` 命名空间隔离，`clear()` / `keys()` 只影响自己的数据
- 可选混淆存储（实例级或单项级，UTF-8 安全；是 XOR + Base64，不是加密，见下文）
- 插件、组合式 API、原生类三种用法共享同一套默认前缀
- 组合式 API 自动跨标签页同步
- 事件监听（set / get / remove / clear / expired）与统计信息
- SSR 下 import 和调用都安全，不会访问 `window`
- 无运行时依赖，Vue 3 为 peerDependency

## 安装

```bash
npm install vue-web-super-storage
# 或 pnpm add vue-web-super-storage / yarn add vue-web-super-storage
```

## 快速开始

### 组合式 API

```vue
<script setup lang="ts">
import { useLocalStorage } from 'vue-web-super-storage'

// 返回 [ref, setValue, removeValue]，ref 的修改会立即写入 storage
const [username, setUsername, removeUsername] = useLocalStorage('username', '匿名')

// 带过期时间写入；之后对 ref 的响应式修改沿用同一过期设置
setUsername('小明', { expires: 24 * 60 * 60 * 1000 })

// 删除：storage 中的 key 被移除，ref 回到默认值，不会再把默认值写回去
// removeUsername()
</script>

<template>
  <input v-model="username" />
</template>
```

### 作为 Vue 插件

```ts
import { createApp } from 'vue'
import VueWebStorage from 'vue-web-super-storage'
import App from './App.vue'

createApp(App)
  .use(VueWebStorage, {
    localStorage: { prefix: 'my-app-', defaultExpires: 7 * 24 * 60 * 60 * 1000 },
    sessionStorage: { prefix: 'my-session-' }
  })
  .mount('#app')
```

在组件中推荐用注入的方式（类型完整，不依赖 `getCurrentInstance`）：

```vue
<script setup lang="ts">
import { inject } from 'vue'
import { useWebStorage, LOCAL_STORAGE_KEY } from 'vue-web-super-storage'

const storage = useWebStorage()              // 等价于 inject(WEB_STORAGE_KEY)
const local = inject(LOCAL_STORAGE_KEY)!     // 直接拿 localStorage 实例

const saveUser = () => {
  storage.setLocal('username', 'xiaoming', { expires: 7 * 24 * 60 * 60 * 1000 })
  storage.setSession('temp-data', 'some data')
  local.get<string>('username')
}
</script>
```

选项式 API 里可以用 `this.$storage.setLocal(...)`（`globalName` 选项可改名）。

### 直接使用存储类

```ts
import { WebStorage, StorageType } from 'vue-web-super-storage'

const storage = new WebStorage({
  type: StorageType.LOCAL,
  prefix: 'my-app-',
  defaultExpires: 24 * 60 * 60 * 1000 // 默认 24 小时过期，0 表示永不过期
})

storage.set('user', { name: 'John', age: 30 })
storage.set('token', 'abc123', { expires: 2 * 60 * 60 * 1000 })
storage.set('secret', '中文😀', { encrypt: true })   // 只混淆这一项，读取时自动识别

storage.get<{ name: string }>('user')
storage.get('token', { defaultValue: 'none' })
storage.has('user')
storage.keys()
storage.getAll()
storage.remove('token')
storage.clearExpired()
storage.getStats()
storage.clear()
```

## 需要知道的几件事

- **默认前缀**：所有入口统一为 `'vue-storage-'`，插件写入的数据组合式 API 能直接读到。
  需要隔离时自行传 `prefix`。
- **过期时间**：单位毫秒；`0` 或不传表示永不过期；`NaN`、负数、`Infinity` 会抛 `TypeError`。
- **关于 `encrypt`**：实现是 **XOR + Base64 的混淆**，只能避免在 DevTools 里直接看到明文，
  密钥随前端代码一起发布，**不具备密码学安全性**。真正敏感的数据不要放在客户端。
- **跨标签页同步**：组合式 API 默认监听 `storage` 事件，`syncAcrossTabs: false` 可关闭。
- **过期清理**：实例化时不扫描；首次访问时按 `(type, prefix)` 每次页面加载清理一次，
  `autoCleanup: false` 关闭，`cleanupInterval` 开启定时清理。
- **SSR**：服务端 import 安全；没有 DOM 时写入返回 `false`，读取返回默认值。
- **浏览器支持**：构建目标 ES2020，依赖 Vue 3，即 Chrome / Edge 80+、Firefox 74+、Safari 13.1+。
  不支持 IE。
- **从 1.0.x 升级**：API 兼容，但插件默认前缀、组合式 API 的删除语义、TTL 校验、混淆格式
  有变化（新版本可读旧数据，反之不行），详见 [CHANGELOG.md](CHANGELOG.md)。

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。欢迎提交 Issue 和 Pull Request。

## 许可证

[MIT](LICENSE)
