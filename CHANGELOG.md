# Changelog

All notable changes to `vue-web-super-storage` are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - unreleased

### Breaking / behaviour changes

- **Unified default prefix.** Every entry point now defaults to `prefix: 'vue-storage-'`
  (the value the `WebStorage` class and the composables already used). The plugin and the
  convenience instances (`local` / `session`, formerly `localStorage` / `sessionStorage`)
  previously used `'vue-local-'` / `'vue-session-'`, so data written through them under the
  implicit default is no longer visible. To keep reading it, pass the old prefix explicitly:
  `app.use(VueWebStoragePlugin, { localStorage: { prefix: 'vue-local-' }, sessionStorage: { prefix: 'vue-session-' } })`.
- **Removal is real.** `removeValue()` from `useStorage`, and `StorageState#remove()` /
  `StorageState#reset()`, delete the key and reset the ref without writing the default value
  back. `reset()` is now an alias of `remove()`.
- **Composable writes are synchronous.** The internal watcher uses `flush: 'sync'`, so storage
  is updated in the same tick as the ref assignment (previously on the next flush).
- **Options stick.** After `setValue(value, { expires, encrypt })`, later reactive edits of the
  same ref are written with the same options instead of silently dropping the TTL.
- **Invalid TTL throws.** `expires` / `defaultExpires` / `cleanupInterval` must be a finite
  number `>= 0`; `NaN`, negative and `Infinity` throw a `TypeError` (1.0.x stored `NaN` as
  "never expires"). `0` and `undefined` still mean "no expiry".
- **New on-disk format for obfuscated items.** Items written with `encrypt` are stored as
  `{"vws":1,"encrypted":true,"data":"<base64>"}` and the XOR runs over UTF-8 bytes, so any
  Unicode value works. 1.1.0 reads everything 1.0.x wrote (plain and obfuscated), but values
  written by 1.1.0 with `encrypt` cannot be read by 1.0.x.
- **Cross-tab sync on by default.** `useStorage` / `useLocalStorage` / `useSessionStorage` /
  `StorageState` listen to the window `storage` event and refresh the ref when another tab
  changes the same key. Pass `syncAcrossTabs: false` to opt out.
- **Lazy, deduplicated cleanup.** The constructor no longer scans storage. Expired items are
  removed on first access, once per `(type, prefix)` per page load (`autoCleanup: false`
  disables it); `cleanupInterval` adds a periodic sweep with one timer per `(type, prefix)`.
- **SSR safe.** No `window` / `localStorage` access at import time or in constructors. Without a
  DOM, writes return `false`, reads return `defaultValue ?? null`, `getStorage()` returns `null`.
- **Types.** The plugin augments `'vue'` (`this.$storage` typing needs Vue >= 3.3; the runtime
  works on any Vue 3). `getStorage()` returns `Storage | null`. The `$storage` shape is the
  exported `StorageApi` type instead of `any`.
- `package.json` gains `exports`, `sideEffects: false` and `engines.node >= 18`. `main` /
  `module` / `types` are unchanged.

### Fixed

- `useStorage`: `setValue(value, { expires })` was immediately overwritten by the deep watcher
  calling `set` without options.
- `useStorage` called outside a component logged a Vue warning (`onUnmounted`); it now uses
  `onScopeDispose` only when a scope exists.
- `encrypt: true` failed (`set` returned `false`) for any non-Latin-1 value such as Chinese
  text or emoji because of `btoa`.
- Per-item `encrypt: true` was honoured on write but ignored on read, so the value came back
  as `null`. The stored envelope now carries the marker and `get` / `has` / `keys` / `getAll` /
  `clearExpired` / `getStats` all use it.
- `version` export was hard-coded to `1.0.0`; it is now injected from `package.json` at build.
- Importing the library on the server threw `ReferenceError: localStorage is not defined`.

### Added

- `local` / `session` aliases for the convenience instances (the `localStorage` /
  `sessionStorage` exports still exist but are deprecated because they shadow globals).
- `WEB_STORAGE_KEY`, `LOCAL_STORAGE_KEY`, `SESSION_STORAGE_KEY` (`InjectionKey`s) and
  `useWebStorage()` for typed injection. The old string keys are still provided.
- `WebStorage#getAll()`, `WebStorage#getFullKey()`, `WebStorage#destroy()`, `DEFAULT_PREFIX`,
  `isBrowser()`, `resolveNativeStorage()`, `normalizeExpires()`, `decryptLegacy()`.
- `useStorage` return value also exposes named members: `state`, `setValue`, `removeValue`,
  `refresh`, `stop`, `storage`.
- `UseStorageOptions` (`syncAcrossTabs`), `StorageOptions.autoCleanup`,
  `StorageOptions.cleanupInterval`, `StorageApi`, `UseStorageReturn`, `EncryptedEnvelope` types.
- Test suite (vitest + happy-dom) and GitHub Actions CI on Node 18 / 20 / 22.
- `CONTRIBUTING.md`, issue templates.

### Removed

- Unused `vite` / `@vitejs/plugin-vue` dev dependencies (vite remains as a transitive
  dependency of vitest, pinned to v6 for Node 18 support).
- The README claim of IE 11 support. The build targets ES2020 and Vue 3.

## [1.0.1] - 2025-08-05

- Rename package to `vue-web-super-storage`.

## [1.0.0] - 2025-07-29

- Initial release.
