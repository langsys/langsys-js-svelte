# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`langsys-js-svelte` is a Svelte 5 binding over the framework-agnostic [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript) package. The base SDK owns the API client, translation lifecycle, token discovery, DOM tokenizer, and SSR-aware token strategies. This package is intentionally thin and contains only Svelte-native concerns.

**Version compatibility:**
- v3.x — Svelte 5 + the function-call `$t()` API. Depends on `langsys-js-typescript`.
- v2.x — Svelte 5, proxy-based `$_['Cat']['Phrase']` API, self-contained.
- Pre-v2 — Svelte 3/4 client-only. Tag `v-last-svelte4-compat`.

## Layout

```
src/lib/
    index.ts                      # public exports — LangsysApp wrapper, t store, Translate, type re-exports
    adapters.ts                   # writable<T> → Signal<T> adapter (svelte/store get → .get())
    components/
        Translate.svelte          # Svelte 5 thin wrapper around langsys-js-typescript's vanilla DOM Translate class
```

That's the entire surface. Every other concern — HTTP, missing-token registration, persistence, SSR strategies, the proxy/lookup/interpolation logic — lives in `langsys-js-typescript`.

## How the wrapping works

1. **`LangsysApp.init({ UserLocaleStore: writable })`** — the wrapper class (`LangsysAppSvelte` in `index.ts`) accepts a Svelte `Writable<string>` for the user locale. Internally it adapts it via `adaptStore` (in `adapters.ts`) to satisfy the base SDK's `Signal<string>` contract (Svelte writables expose `subscribe/set/update` — the adapter synthesizes `.get()` via `svelte/store`'s `get` helper). Every other `LangsysApp.*` method is a direct delegation.

2. **`t` as a Svelte store** — the underlying `tSignal` from `langsys-js-typescript` is a `Signal<TFunction>` that re-emits a fresh closure on every translations/locale change. `Signal` structurally satisfies Svelte's `Readable<T>` contract (subscribe-fires-immediately semantics), so we re-export it under the type `Readable<TFunction>` with no runtime wrapping. `$t('Cat', 'Phrase')` works because:
    - `$t` unboxes the store, returning the current `TFunction`
    - The function is called with `('Cat', 'Phrase')`, returning the current translation
    - Reactivity comes from the store re-emitting → the template re-runs `$t(...)`

3. **`<Translate>`** — wraps `langsys-js-typescript`'s vanilla `Translate` DOM class. `bind:this` on a `svelte:element` gets us the host node; an `$effect` constructs `new Translate(host, opts)` on mount; `onDestroy` calls `instance.destroy()`. The DOM walking, content-block registration, attribute harvesting, and re-translation on locale change all live in the underlying class.

## Public API

```typescript
// Main entry point — wraps init to accept Writable, delegates everything else
LangsysApp.init({ projectid, key, UserLocaleStore, baseLocale?, debug?, ssrTokenStrategy?, initialTranslations?, initialTranslationsLocale? })
LangsysApp.t                     // current TFunction (snapshot — not reactive on its own)
LangsysApp.getCountries() / getCurrencies() / getDialCodes() / getLocales*() / ...
LangsysApp.detectPreferredLocale(acceptLanguageHeader?, supportedLocales?)
LangsysApp.refresh()
LangsysApp.translationsLoadingPromise

// Reactive stores (Svelte Readable<T>)
t                                // Readable<TFunction> — read with $t('Cat', 'Phrase', params?)
currentlyLoadedLocale            // Readable<string>
sTranslations                    // Readable<iCategories>
contentBlocks                    // Readable<iContentBlock[]>

// Component
<Translate category? custom_id? label? tag? class? children />

// Direct API client access (vanilla — no Svelte concerns)
LangsysAppAPI

// Types — all sourced from langsys-js-typescript, re-exported for ergonomic imports
iLangsysInitConfig (the Svelte-flavored one — UserLocaleStore is Writable<string>)
iLangsysResponse, iCategories, iTranslations, iContentBlock, iCountry, iCountryDialCode, iCountryList,
iCurrency, iCurrencyList, iLanguageName, iLocaleData, iLocaleDefault, iLocaleFlat, iProject,
TFunction, TranslationParams, ParamPrimitive, ExtractParamKeys, ParamsFor, TArgs
```

## Essential commands

- `npm run dev` — Vite dev server with the demo at `src/routes/+page.svelte`. Needs `.env` with `VITE_LANGSYS_PROJECT_ID` and `VITE_LANGSYS_API_KEY` (see `.env.example`).
- `npm run check` — `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json`. Should be clean before any commit.
- `npm run package` — `svelte-kit sync && svelte-package && publint`. Builds to `dist/`. Note: the `publint` step warns about the local `file:../langsys-js-typescript` dep — expected during development.
- `npm run test` — Vitest. Tests are minimal; expand here for new features.
- `npm run lint` / `npm run format` — Prettier + ESLint.

## Local development setup

This package depends on `langsys-js-typescript` via `file:../langsys-js-typescript`. After changes to the base SDK:

```bash
cd ../langsys-js-typescript
npm run build         # rebuilds dist/
cd ../langsys-js-svelte
npm run check         # picks up new types
```

For end-user installs the dep would resolve to a real npm version — the file: form is for the monorepo workflow only.

## Release & publishing

Releases are CI-driven via npm **trusted publishing** (OIDC). There is no long-lived npm token anywhere — neither in the repo, in CI secrets, nor on the maintainer's laptop.

The flow:

1. **Local:** `npm run release` (alias for `./_dev_/publish.sh`) — prompts for the new version, bumps `package.json`, amends the last commit with the version bump, force-pushes `main`, creates a tag `vX.Y.Z`, creates a GitHub Release. **It does not publish to npm.**
2. **CI:** the `release: published` event triggers `.github/workflows/publish.yml`, which runs `npm ci` → `npm run check` → `npm test` → `npm run package` → `npm publish --provenance`. Publishing happens inside the `npm-publish` GitHub Environment so only tag-ref runs can mint the OIDC token.
3. **PR/push gate:** `.github/workflows/ci.yml` runs `check` + `test` on every PR and every push to `main`, independent of the release flow.

If a publish fails after the GitHub Release was created, the Release stays but no npm version exists for that tag — fix forward by either deleting the GH release and re-running `npm run release`, or by re-running the failed workflow from the Actions tab once the fix is merged.

The three trust-handshake strings must stay in sync, or CI will fail at the publish step:

- GitHub Environment name: `npm-publish`
- npm trusted publisher config: Environment name `npm-publish`, workflow filename `publish.yml`
- `.github/workflows/publish.yml`: `environment: npm-publish`

## When making changes

- **Do not reimplement base-SDK behavior here.** API client, lookup logic, missing-token flow, persistence, SSR strategies all belong in `langsys-js-typescript`. If you need to extend any of that, the change goes in the base package and we re-export.
- **Keep `<Translate>` to mount/destroy glue.** The DOM walking lives in the vanilla `Translate` class in `langsys-js-typescript`. Don't fork the tokenizer here.
- **Type re-exports go through `index.ts`.** Consumers shouldn't have to reach into `langsys-js-typescript` for routine types.
- **`t`'s reactivity story** depends on the base SDK re-emitting a fresh `TFunction` closure on every translations/locale change. If you find templates not re-rendering after a locale change, look at the `tSignal` subscriber wiring in `langsys-js-typescript`'s `Translations` class — not here.

## Testing approach

Vitest with default SvelteKit-package config. The current test file is a smoke check; real coverage is light. New features benefit from tests, especially around the writable→Signal adapter and the `<Translate>` mount lifecycle.
