## 2.0.0 - 2026-05-17

### BREAKING CHANGES

- **Svelte 5 required.** `peerDependencies.svelte` narrowed from `^3.3.0 || ^4.0.1 || ^5.0.0` to `^5.0.0`. Svelte 3 / 4 consumers must stay on `1.2.1` or use the `v-last-svelte4-compat` tag.
- **`idb-keyval` removed** as a direct dependency. The storage layer now uses a progressive fallback (IndexedDB → localStorage → in-memory) via `@macfja/svelte-persistent-store`. Code reaching into the previous IDB-backed store will need to migrate.
- **`Translate` component rewritten in Svelte 5 syntax.** Not consumable from Svelte 3 / 4 runtimes.
- **`updateTokens` now posts to `projects/:projectid/tokens`** (v2 API path). Requires a Langsys backend that serves the v2 token endpoint.
- **Legacy parameter-based `LangsysApp.init(projectid, key, store, …)` is deprecated** and logs a `console.warn` on use. It still works in 2.x but will be removed in 3.0. Migrate to the config-object form: `LangsysApp.init({ projectid, key, UserLocaleStore, … })`.

### Added

- `LangsysApp.detectPreferredLocale()` — works in both browser (`navigator.languages`) and SSR (`Accept-Language` header), with optional supported-locale matching (exact → language-only → null).
- `ssrTokenStrategy` config option (`'client' | 'server' | 'auto'`, default `'client'`) controlling when missing tokens are flushed during SSR.
- Microtask-batched server flushes and hydration-aware replay of SSR-collected tokens.
- `change(locale, force, skipFetch)` — `skipFetch` lets callers skip the network fetch when SSR-prefetched data is already present.
- SSR-compatible content-block resolution in `Translate.svelte`.
- New exports: `iLangsysInitConfig`, `iCurrency`, `iCurrencyList`, `iCategories`, `iTranslations`.
- New interface files: `currencies.ts`; expanded `countries.ts` and `config.ts`.
- API key permission detection: read-only keys automatically skip missing-token collection and content-block creation.
- `README-SSR.md` documenting SSR usage.
- Test suite: `ssr-init.test.ts` (6 cases).

### Changed

- `updateTokens` now de-duplicates against the current store state before sending.
- `debug` flag is now applied early in initialization so init-time logs are captured.
- Translation Proxy no longer `structuredClone`s the whole `$trans` store on every `$_['Cat']['Token']` read (significant hot-path perf win).
- Proxy introspection switched from brittle string-matching to `typeof prop === 'symbol' || prop === 'constructor'`, with `Reflect.get` on real category proxies (fixes `obj.constructor` and similar engine paths).
- Full dev-dep refresh: vite 5→8, vitest 2→4, typescript 5→6, eslint 9→10, eslint-plugin-svelte 2→3, `@sveltejs/vite-plugin-svelte` 4→7, `@sveltejs/adapter-auto` 3→7, publint 0.2→0.3, plus minor bumps. Only shipped dep change: `@ungap/structured-clone` 1.2 → 1.3.

### Fixed

- Infinite loop under Svelte 5.
- Timer handling in SSR environments.
- TypeScript type errors across multiple files; proper annotations on utility functions and `__uncategorized__` assignments.

### Removed

- `idb-keyval` dependency.
- `structuredCloneShim` helper (no remaining callers).
- Dead `__DirectToken__` prototype and other commented-out cruft (~25 lines).

---

## 1.2.1 - 2025-06-04

Last release supporting Svelte 3 / 4. See git history for prior changes.
