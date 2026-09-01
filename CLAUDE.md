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
README.md                         # ships in the tarball
README-SSR.md                     # ships in the tarball (since 3.6.15); SSR patterns, incl. the component-body seed
src/lib/
    index.ts                      # public exports — LangsysApp wrapper, t store, components, type re-exports
    adapters.ts                   # writable<T> → Signal<T> adapter (svelte/store get → .get())
    components/
        Translate.svelte          # Svelte 5 thin wrapper around langsys-js-typescript's vanilla DOM Translate class
        Phrase.svelte             # thin wrapper around the vanilla Phrase rich-text handler
        DontTranslate.svelte      # pure glue — emits translate="no"; no vanilla handler behind it
```

That's the entire surface. Every other concern — HTTP, missing-token registration, persistence, SSR strategies, the proxy/lookup/interpolation logic — lives in `langsys-js-typescript`.

## How the wrapping works

1. **`LangsysApp.init({ UserLocaleStore: writable })`** — `LangsysApp` is a **Proxy over the core singleton** (`index.ts`, handler in `proxy-handler.ts`), not a wrapper class. `init` is one of exactly two overrides: it accepts a Svelte `Writable<string>` and adapts it via `adaptStore` (in `adapters.ts`) to the base SDK's `Signal<string>` contract (Svelte writables expose `subscribe/set/update` — the adapter synthesizes `.get()` via `svelte/store`'s `get` helper). `setWriteGrant` is the other. Every other member forwards to the core, bound to it, so a member the core gains later is exposed without anyone remembering to list it.

2. **`t` as a Svelte store** — the underlying `tSignal` from `langsys-js-typescript` is a `Signal<TFunction>` that re-emits a fresh closure on every translations/locale change. `Signal` structurally satisfies Svelte's `Readable<T>` contract (subscribe-fires-immediately semantics), so we re-export it under the type `Readable<TFunction>` with no runtime wrapping. `$t('Phrase', 'Cat')` works because:
    - `$t` unboxes the store, returning the current `TFunction`
    - The function is called with `('Phrase', 'Cat')`, returning the current translation
    - Reactivity comes from the store re-emitting → the template re-runs `$t(...)`

3. **`<Translate>`** — wraps `langsys-js-typescript`'s vanilla `Translate` DOM class. `bind:this` on a `svelte:element` gets us the host node; an `$effect` constructs `new Translate(host, opts)` on mount; `onDestroy` calls `instance.destroy()`. The DOM walking, content-block registration, attribute harvesting, and re-translation on locale change all live in the underlying class.

## Public API

```typescript
// Main entry point — wraps init to accept Writable, delegates everything else
LangsysApp.init({ projectid, key, UserLocaleStore, baseLocale?, debug?, ssrTokenStrategy?, initialTranslations?, initialTranslationsLocale?, writeGrant? })
LangsysApp.setWriteGrant(grant)  // async — re-authorizes so the server re-evaluates the session
LangsysApp.t                     // current TFunction (snapshot — not reactive on its own)
LangsysApp.getCountries() / getCurrencies() / getDialCodes() / getLocales*() / ...
LangsysApp.detectPreferredLocale(acceptLanguageHeader?, supportedLocales?)
LangsysApp.refresh()
LangsysApp.translationsLoadingPromise

// Reactive stores (Svelte Readable<T>)
t                                // Readable<TFunction> — read with $t('Phrase', 'Cat', params?)
currentlyLoadedLocale            // Signal<string>      — readable as $store, and WRITABLE
sTranslations                    // Signal<iCategories>  — readable as $store, and WRITABLE
writeEnabled                     // Readable<boolean | undefined> — tri-state, and READ-ONLY:
                                 // the one store wrapped rather than re-exported, so unlike the
                                 // two above it is genuinely not writable. undefined = not known yet

// Components
<Translate category? custom_id? label? tag? class? params? children />
<Phrase category? params? tag? class? children />          // one markup-bearing sentence kept whole
<DontTranslate tag? class? children />                     // never translated (translate="no")

// Markup placeholders are %name%, not {name} — Svelte compiles a bare {name}
// as its own expression tag. $t() keeps {name} (JS string, no collision).

// Direct API client access (vanilla — no Svelte concerns)
LangsysAppAPI

// Types — all sourced from langsys-js-typescript, re-exported for ergonomic imports
iLangsysInitConfig (the Svelte-flavored one — UserLocaleStore is Writable<string>)
iLangsysResponse, iCategories, iTranslations, iContentBlock, iCountry, iCountryDialCode, iCountryList,
iCurrency, iCurrencyList, iLanguageName, iLocaleData, iLocaleDefault, iLocaleFlat, iProject,
TFunction, TranslationParams, ParamPrimitive, ExtractParamKeys, ParamsFor, TArgs
WriteGrant (base-SDK union), WriteGrantSource (that union plus a Svelte store)
```

**`writeEnabled` is the one store NOT re-exported by reference.** Everything else (`t`,
`currentlyLoadedLocale`, `sTranslations`) is the base signal itself, so no code here sits
in the catalog-miss path — which is what lets this package be _excluded_ from an
investigation rather than merely defended. `writeEnabled` is wrapped in `src/lib/stores.ts`
because reading the live signal during hydration is a mismatch hazard specific to
SvelteKit: a universal `load` re-runs on the client and is awaited _before_ mount, so
`await LangsysApp.init()` in a load resolves authorization before the first client render.
The wrapper changes only _when_ the value is observable, never what it is. See
`src/lib/stores.test.ts`.

## Commit conventions

**Do not add `Co-Authored-By:` or `Claude-Session:` trailers to commits in this repo.** Fleet
convention across the Langsys SDKs; the history here should read as the project's, not as a
record of which tool produced it. Applies to every commit, including WIP.

## Conformance

`CONFORMANCE.md` maps this binding to the published SDK behaviour spec
(`langsys2:docs/sdk-spec.mdx`), rule id → grade → evidence. Two norms are load-bearing and easy
to erode:

- **Nothing mock-evidenced grades `implemented`** (CONF-2). This repo's integration suite is
  `live` — real browser, real base SDK, real API — which is why its rows can reach that grade.
  If the suite is ever doubled, the grades move down with it.
- **Every `delegated` row states a non-zero count for the control that would have found
  participation.** "We found nothing" is worthless unless the same search demonstrably finds
  something where it does live.

## Essential commands

- `npm run dev` — Vite dev server with the demo at `src/routes/+page.svelte`. Needs `.env` with `VITE_LANGSYS_PROJECT_ID` and `VITE_LANGSYS_API_KEY` (see `.env.example`).
- `npm run check` — `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json`. Should be clean before any commit.
- `npm run package` — `svelte-kit sync && svelte-package && publint`. Builds to `dist/`. `publint` should report "All good!" — the dep is the published npm `langsys-js-typescript`, so there is no `file:` dep to warn about.
- `npm run test` — Vitest. Tests are minimal; expand here for new features.
- `npm run lint` / `npm run format` — Prettier + ESLint.

## Local development setup

This package depends on the **published** `langsys-js-typescript` from npm (a caret range like `^0.3.x`), exactly as an end user would — never a `file:`/symlink/`npm link` dep. A local link has bitten us before (a stale local build silently shadowing the real package), so the dependency stays de-linked at all times.

To pick up base-SDK changes:

```bash
cd ../langsys-js-typescript
npm run build         # rebuild dist/
# bump + publish (npm run release), then back here:
cd ../langsys-js-svelte
npm install langsys-js-typescript@latest   # or bump the range in package.json
npm run check                              # picks up the new types
```

If you ever must test an unpublished base-SDK build locally, do it in a throwaway checkout and **revert before committing** — never commit a `file:` dep. Consumers must always resolve the real npm version.

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

- **`sTranslations` / `currentlyLoadedLocale` are writable, process-global signals, and `README-SSR.md` documents writing to them.** Seeding them synchronously in a layout component body is what makes `$t()` resolve during SSR — measured clean at 400 concurrent requests, because Svelte's default server renderer completes a page in one uninterrupted synchronous pass. That safety is narrower than it looks: seeding anywhere that `await`s before rendering (a `hooks.server.js` hook, an async server module) bled 70/80 requests into the wrong language, and `compilerOptions.experimental.async` switches Svelte to a renderer that yields mid-tree, which removes the guarantee entirely. Do not restate or extend that guidance without re-measuring — the numbers are in the CHANGELOG for 3.6.11 and 3.6.13.

- **Docs that ship:** `README.md`, `README-SSR.md`, and the `src/lib/**` JSDoc go into the npm tarball (the JSDoc is what IDE hover shows); `CHANGELOG.md` is GitHub-only. `README-SSR.md` is listed in `files` — it did not ship before 3.6.15, which left `README.md` pointing at a document installed users did not have, and the failed-fetch reset rule reachable only from GitHub. A fix to a shipped doc only reaches npmjs.com on publish.

- **Do not reimplement base-SDK behavior here.** API client, lookup logic, missing-token flow, persistence, SSR strategies all belong in `langsys-js-typescript`. If you need to extend any of that, the change goes in the base package and we re-export.
- **Keep `<Translate>` to mount/destroy glue.** The DOM walking lives in the vanilla `Translate` class in `langsys-js-typescript`. Don't fork the tokenizer here.
- **Type re-exports go through `index.ts`.** Consumers shouldn't have to reach into `langsys-js-typescript` for routine types.
- **`t`'s reactivity story** depends on the base SDK re-emitting a fresh `TFunction` closure on every translations/locale change. If you find templates not re-rendering after a locale change, look at the `tSignal` subscriber wiring in `langsys-js-typescript`'s `Translations` class — not here.

## Testing approach

Vitest with default SvelteKit-package config. The current test file is a smoke check; real coverage is light. New features benefit from tests, especially around the writable→Signal adapter and the `<Translate>` mount lifecycle.
