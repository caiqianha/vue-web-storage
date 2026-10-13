# Changelog

All notable changes to `vue-web-super-storage` are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.2.0] - 2026-10-13

Fully backward compatible with 1.1.0: no option, export or on-disk format changed its meaning.

### Added

- **IndexedDB adapter.** `createIndexedDBStorage({ dbName, storeName, prefix, expires, encrypt, … })`
  returns an `IndexedDBStorage` whose `get` / `set` / `remove` / `clear` / `has` / `keys` /
  `getAll` / `clearExpired` mirror `WebStorage` but return Promises. TTL, prefix, obfuscation
  envelope and schema / version options are shared with the sync adapters, so the stored
  strings are identical. Built on a tiny promise wrapper over the raw IDB API (no `idb`
  dependency); the object store is created on demand, including in an existing database.
  `useIndexedDB(key, default, options)` returns `{ data, isReady, error, refresh, remove,
  setValue, flush, stop, storage }`: `data` starts as the default and is hydrated
  asynchronously (`isReady` flips afterwards), reactive edits are debounced into one write
  (`debounce`, default `0` = next macrotask; `flush()` forces it), pending writes are flushed on
  scope dispose and `pagehide`, and local edits made while hydration is in flight win. Cross-tab
  sync uses a `BroadcastChannel` named `vue-web-super-storage:<dbName>:<prefix>` with a feature
  check (`syncAcrossTabs: false` to opt out). Without IndexedDB (SSR, old browsers) every
  adapter call is a no-op that warns once; the composable does not hydrate on the server and
  does not warn.
- **Schema validation.** New `schema` option on `WebStorage`, `IndexedDBStorage` and all
  composables, accepting a [Standard Schema](https://standardschema.dev) object (zod 3.24+,
  valibot, arktype, …) or a plain `(value) => value | throws` function. Writes are validated
  **before** persisting and throw `StorageValidationError` synchronously (`IndexedDBStorage#set`
  rejects); nothing is written. Reads that fail validation fall back to `defaultValue ?? null`,
  are treated as absent by `has` / `keys` / `getAll`, leave the raw entry in place and call
  `onInvalid(key, error)` (default: `console.warn` unless `process.env.NODE_ENV === 'production'`).
  Validation output is what gets stored, so schema defaults / transforms apply. `schema` can
  also be passed per call in `set` / `get` options. Asynchronous schemas are only supported by
  the IndexedDB adapter; the sync API throws a `TypeError` for them.
- **Versioned migrations.** `version: number` writes `v` into the envelope. On read, items
  whose version is lower (1.1.0 data has no `v` and counts as `0`) go through `migrate(oldValue,
  oldVersion)` or the chain `migrations: { 1: fn, 2: fn }` (`migrations[n]` upgrades `n-1 → n`;
  missing steps are skipped; `migrations` wins if both are given), then through `schema`. The
  migrated value is written back once with the new version (keeping TTL and obfuscation), so
  migrations run a single time per item. A migration that throws is reported through
  `onInvalid` and the default is returned. Items with a newer version are returned untouched.
- **Nuxt module** at `vue-web-super-storage/nuxt` (`dist/nuxt.mjs` + `dist/nuxt.d.ts`,
  `@nuxt/kit >= 3` as an optional peer dependency). `modules: ['vue-web-super-storage/nuxt']`
  plus `webStorage: { prefix, expires, encrypt, encryptKey, globalName, sessionStorage, mode,
  autoImports }` installs `VueWebStoragePlugin` through a generated plugin and auto-imports
  `useLocalStorage`, `useSessionStorage`, `useIndexedDB` and `useWebStorage`. The plugin is
  installed on server and client by default (`mode: 'all'`) because the Vue plugin is SSR-safe
  and `useWebStorage()` would otherwise throw during SSR; `mode: 'client'` is available.
- **`initOnMounted` option** for `useStorage` / `useLocalStorage` / `useSessionStorage` /
  `StorageState`: the ref holds the default value during setup and reads storage in
  `onMounted`, so server and client render the same first frame. Outside a component it reads
  immediately. Off by default (unchanged behaviour).
- New exports: `IndexedDBStorage`, `createIndexedDBStorage`, `useIndexedDB`, `hasIndexedDB`,
  `hasBroadcastChannel`, `indexedDBChannelName`, `DEFAULT_DB_NAME`, `DEFAULT_STORE_NAME`,
  `DEFAULT_ENCRYPT_KEY`, `StorageValidationError`, `validateSync`, `validateAsync`,
  `runMigrations`; types `StandardSchemaV1`, `StandardSchemaIssue`, `StandardSchemaResult`,
  `SchemaValidator`, `StorageSchema`, `MigrateFn`, `OnInvalidHook`, `SchemaOptions`,
  `IndexedDBOptions`, `UseIndexedDBOptions`, `UseIndexedDBReturn`, `IndexedDBBroadcastMessage`,
  `ResolvedStorageOptions`, `ResolvedIndexedDBOptions`.
- `package.json`: `exports["./nuxt"]`, `typesVersions`, `peerDependenciesMeta`
  (`@nuxt/kit` optional). Dev dependencies: `fake-indexeddb` (test setup only), `@nuxt/kit`,
  `@nuxt/schema`, `zod` (one interop test).

### Changed

- `useStorage().setValue()` writes to storage **before** updating the ref, so a failed schema
  validation leaves the ref untouched. Without a schema nothing observable changes (the write
  was already synchronous).
- `WebStorage#getOptions()` is typed as `ResolvedStorageOptions` (schema-related fields stay
  optional) instead of `Required<StorageOptions>`.
- `StorageItem` gains the optional `v` field.

### Compatibility notes

- 1.2.0 reads every format 1.0.x and 1.1.0 wrote. Without `version` / `schema` it writes the
  exact 1.1.0 envelope. With `version` set, the envelope gains `v`, which 1.1.0 ignores, so even
  that data remains readable by 1.1.0.
- `StorageOptions` now extends `SchemaOptions`; all new fields are optional.

## [1.1.0] - 2026-10-12

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
