# Contributing

Thanks for taking the time. The project is small, so the process is too.

## Setup

```bash
git clone https://github.com/caiqianha/vue-web-storage.git
cd vue-web-storage
npm install
```

Node 18 or newer is required (CI runs 18 / 20 / 22).

## Day-to-day commands

| Command | Purpose |
| --- | --- |
| `npm test` | run the vitest suite once (`npm run test:watch` for watch mode) |
| `npm run typecheck` | `tsc --noEmit` over `src/` |
| `npm run build` | rollup build into `dist/` (ESM, UMD, `.d.ts`) |

## Pull requests

1. Open an issue first for anything beyond a small fix, so we can agree on the API.
2. Every behaviour change needs a test in `test/`. Bug fixes need a regression test that fails before the fix.
3. Keep the public API backward compatible when you can; when you cannot, add a line under the next version in `CHANGELOG.md` (section "Breaking / behaviour changes").
4. Do not add runtime dependencies. Vue stays a peer dependency.
5. Update `README.md` (quick start) and/or `docs/API.md` (full reference) when the API surface changes.
6. Make sure `npm run typecheck && npm test && npm run build` passes locally before pushing.

## Releasing (maintainers)

Bump `version` in `package.json`, update `CHANGELOG.md`, then `npm publish`. `prepublishOnly` runs clean + typecheck + tests + build; the `version` export is injected from `package.json` at build time.
