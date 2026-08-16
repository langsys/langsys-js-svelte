## 3.6.1 - 2026-08-16

### Changed

- Base SDK floor bumped to `langsys-js-typescript` ^0.6.3. SSR-handoff and tokenizer fixes, all inside the base SDK — no wrapper code changed:
    - **`data-notrans` is honored** as langsys-php's author-facing alias for `translate="no"`. It survives into their `translatePage()` output, so on a handoff, content an author had marked do-not-translate was being harvested by whichever SDK walked it.
    - Phrase-marker values are **trimmed** before comparison, matching a normalization PHP performs on its side.
    - **`translate="no"` is now matched case-insensitively** — a gap that predated the cross-SDK work and applies to plain Svelte apps too, not just PHP handoff.
    - **`<select>` option text is no longer harvested twice.** Any content block containing a `<select>` was producing duplicated tokens, diverging its `custom_id` from `langsys-php`'s. Migration is lookup-only across all historical id shapes, so nothing loses its translations, and content without a `<select>` does not rebase.
    - **Four more translatable attributes**: `label`, `aria-description`, `aria-valuetext`, `aria-roledescription`. `label` is the text a user actually reads in a `<select>` picker; the ARIA three are spoken by screen readers, so leaving them untranslated degraded accessibility specifically for the users least able to work around it.

### Fixed (documentation)

- The `<Translate>` attribute list is now presented as examples rather than an exhaustive enumeration, and names the accessibility attributes. That list is owned by the base SDK's tokenizer and grew twice this week — a copy of someone else's changing surface is a doc defect waiting to happen.
- README documents the **cross-SDK marker boundary** for apps hydrating `langsys-php`-rendered markup: `data-ls-phrase` is ours and internal (emitted by `<Phrase>`, never author-written), while langsys-php's `data-langsys-*` and `data-notrans` are author-written. Inverted authorship over the same territory, and a reader working across both SDKs meets both at once. The accepted values are linked rather than restated — that surface belongs to langsys-php and has changed repeatedly.

---

## 3.6.0 - 2026-08-15

### Changed

- Base SDK floor bumped to `langsys-js-typescript` ^0.6.1. Three fixes ride along, all entirely inside the base SDK — no wrapper code changed:
    - **`md5` now agrees with standard UTF-8 MD5.** It had been packing UTF-16 code units into byte lanes, so it only matched for ASCII: non-ASCII content-block ids diverged from `langsys-php`'s, and distinct blocks could collide. Pure-ASCII ids are byte-identical to before, so only non-ASCII blocks rebase, and migration is automatic and lookup-only — `Translate` falls back to the legacy id when the corrected one misses, while registration always uses the corrected id.
    - **The tokenizer now recognises `data-langsys-phrase`** (langsys-php's keep-together marker) alongside our `data-ls-phrase`. On an SSR handoff both SDKs walk one DOM, so ours had been recursing into subtrees PHP deliberately kept whole — splitting them at tag boundaries, the exact failure `<Phrase>` exists to prevent. Relevant if you hydrate PHP-rendered markup.
    - **`data-langsys-phrase="false"` / `="0"` is honored as an explicit opt-out** (case-insensitively). Unlike our internal marker, PHP's is author-facing, so an author can un-mark a subtree; matching on presence alone would have skipped content the author had deliberately released — tokenized by PHP, skipped by JS, translated properly by neither.

### Fixed (documentation)

- `<Phrase>` section gains **phrase-key stability** as a third reason, after grammatical agreement and reordering. It is the argument against hand-rolling: passing an element's `innerHTML` to `$t()` yourself puts Svelte's content-derived scoped-style hashes (`svelte-a1b2c3`) into the phrase key, so a restyle silently drifts the key and the page falls back to the base language.
- The `<Phrase>` counter-example demonstrated two silent failures — the tag-boundary split and a compiled-away `{reviewCount}` — while the prose explained only the split, so a reader could conclude braces are safe inside `<Phrase>`. Both are now labelled, and `data-ls-phrase` is marked as an internal marker rather than an authoring hook.
- **CHANGELOG entries reconstructed for 3.1.0 and 3.1.1**, which shipped with no entry at all. 3.1.0 is where `<Phrase>` and `<DontTranslate>` were added and `contentBlocks` was removed — one missing entry that produced documentation defects on three separate surfaces over four minor releases.
- Four release dates corrected against the npm publish record (3.5.0, 3.4.1, 3.1.1, 3.1.0).

### Infrastructure

- CI now enforces **changelog tag coverage** on every push and PR: every released tag must have a CHANGELOG section. Runs with `fetch-depth: 0`, without which `actions/checkout`'s tagless shallow clone makes the check pass vacuously.
- The release script now **stamps the `## Unreleased` heading** with the version and date as it runs, so entries are dated from the release rather than from whenever they were written — the cause of four wrong dates corrected above. Stamping happens before the release commit is amended, so the date is carried by the git tag and the GitHub release rather than added afterwards. (This package's npm tarball ships only `dist` and does not include `CHANGELOG.md`, so no published artifact was ever at risk of reading "Unreleased" — that hazard applies to packages that do ship theirs.)

---

## 3.5.0 - 2026-08-15

### Changed

- **`<Phrase>`'s `params` prop narrows from `Record<string, unknown>` to `Record<string, ParamPrimitive>`.** Matches `<Translate params>` and `$t()`. The loose type admitted values interpolation can only render as `[object Object]` — objects, arrays, functions — so this rejects at compile time what was already broken at runtime. **Runtime behavior is unchanged**; existing code that passed only strings, numbers, `Date`s, or booleans is unaffected. Code that passed richer values will now fail typecheck, which is the point.
- Base SDK floor bumped to `langsys-js-typescript` ^0.5.0, which carries the corresponding `PhraseOptions.params` narrowing. The wrapper's own narrowing was applied ahead of the bump and is assignable to both the old and new base types, so no code changed when the floor moved. (Supersedes an interim 0.4.3 lockfile update — framework-neutral wording in the unused-params warning.)

### Fixed (documentation)

- **`<Phrase>` and `<DontTranslate>` are now documented.** Both have shipped since 3.x, but the README covered neither and the `index.d.ts` "Public API" header — what IDE hover and autocomplete surface — listed only `<Translate>`. Readers reasonably concluded the components did not exist and reached for `<Translate>` on content that needs `<Phrase>`, which silently breaks pluralization: a count and the noun it inflects land in separate catalog entries, so no ICU plural rule can select the right form. Tolerable in English, untranslatable in Russian (4 plural categories), Polish (4), Arabic (6).
- `<Phrase>`'s JSDoc example used a bare `{n}` placeholder in markup — the exact mistake the README warns about, in the file's canonical pluralization example. Now `%n%`.
- README claimed `Date` params serialize to ISO 8601. Stale since the 3.2.0 CLDR adoption; they format in locale medium date style (`Mar 14, 2026` / `14.03.2026`).
- Layering summary and `CLAUDE.md` API summary corrected — both listed only `<Translate>`; `CLAUDE.md` additionally showed `$t()` category-first (it is phrase-first) and a `contentBlocks` store that was removed after 3.0.0.

No runtime behavior changed in any of the documentation fixes above.

---

## 3.4.1 - 2026-08-08

### Changed

- Base SDK floor bumped to `langsys-js-typescript` ^0.4.2, which adds a debug-mode diagnostic for the `{name}`-in-markup mistake: passing `params` whose keys match no placeholder in the captured content now warns and names the fix (`write %count% instead`). That state is the fingerprint of having written `{name}` in markup and had the Svelte/JSX compiler substitute it before Langsys saw the text. ICU slots count as legitimate uses, the warning re-fires only when the params key-set changes, and it is silent in production. No wrapper code change — `<Translate>`/`<Phrase>` inherit it through the base SDK.
- README notes the new debug diagnostic under "Interpolation with `params`".

---

## 3.4.0 - 2026-07-08

### Changed

- **Markup placeholders now use `%name%`, not `{name}`.** Bare `{name}` written inside `<Translate>`/`<Phrase>` content is consumed by the Svelte compiler (same as JSX) as an expression tag before Langsys sees it, silently breaking translation while still rendering correctly in the base locale. `langsys-js-typescript` ^0.4.1 adds a compiler-safe `%name%` markup delimiter that it normalizes back to canonical `{name}` at capture time — so translators still only ever see `{name}`, both spellings register the same content-block, and literal `%` in prose ("50% off") is left untouched. `$t()` is unaffected and keeps single-brace `{key}` (its placeholders live in JS strings, where there is no compiler collision).
- Base SDK floor bumped to `langsys-js-typescript` ^0.4.1 (adds the `%name%` markup normalization). The wrapper needs no code change — the normalization lives entirely in the base SDK's tokenizer.
- README `<Translate params>` example updated from the previous `{name}` form to `%name%`, with the rationale documented inline.

---

## 3.3.0 - 2026-07-08

### Added

- **`<Translate params={{ … }}>`** — the component now accepts a `params?: Record<string, ParamPrimitive>` prop, forwarded to the base SDK's `Translate` and re-applied via `setParams()` when it changes. Enables `{name}`/`{count}`-style single-brace interpolation (same syntax as `$t()`) across content-block text nodes, translatable attributes, select options, and the single-token path. Mirrors the existing `<Phrase params={…}>` prop.

### Changed

- Base SDK floor bumped to `langsys-js-typescript` ^0.4.0, which adds `TranslateOptions.params` and `Translate.setParams()`. The prior `^0.3.0` range permitted installs lacking those, so the floor is raised in lockstep with the feature.

---

## 3.2.0 - 2026-07-03

### Added

- Re-export of `canonicalizeLocale()` from the package index, so consumers don't need a direct import of `langsys-js-typescript` to normalize locale identifiers.

### Changed

- **Base SDK bumped to `langsys-js-typescript` ^0.3.0 (CLDR-compliant).** No wrapper API changes, but consumers inherit the new SDK behavior:
    - Locale identifiers are canonicalized to BCP 47 everywhere (`en-us` → `en-US`) — on the wire, in cache keys, and in `$currentlyLoadedLocale` emissions. Comparisons against lowercase literals should be updated (or routed through the SDK's `canonicalizeLocale()`).
    - `detectPreferredLocale` matching is script-aware via CLDR likely-subtags (`zh-TW` matches `zh-Hant`, never falls back to `zh-Hans`); results come back canonical.
    - `{name}` interpolation now formats `number` params via `Intl.NumberFormat` and `Date` params via `Intl.DateTimeFormat` (medium date style) instead of `String()` / ISO 8601. String-typed values opt out.
    - Style-less ICU args (`{n, number}`, `{d, date}`, `{t, time}`) now format instead of rendering literally.
- README and demo updated to canonical locale casing (`en-US`, `es-ES`, `fr-FR`, `de-DE`).

---

## 3.1.1 - 2026-06-24

_Entry reconstructed from git history on 2026-08-15; this release originally shipped without one. Date taken from the npm publish record._

### Changed

- Base SDK floor bumped to `langsys-js-typescript` ^0.2.2.

---

## 3.1.0 - 2026-06-10

_Entry reconstructed from git history on 2026-08-15; this release originally shipped without one. Date taken from the npm publish record. Its absence has a documented cost — see the note below._

### Added

- **`<Phrase>`** — thin wrapper over the base SDK's vanilla `Phrase` rich-text handler. Keeps a markup-bearing run as ONE translatable phrase: mounts on a host carrying `data-ls-phrase` (so a wrapping `<Translate>` skips the subtree), forwards `category` + `params`, and re-applies params on change.
- **`<DontTranslate>`** — marks its host `translate="no"`, which the base SDK's tokenizer and renderer already honor. Pure glue; no vanilla handler behind it.

### Changed

- Base SDK floor bumped to `langsys-js-typescript` ^0.2.0 (the new components require the 0.2 API).
- **`$t()` documentation corrected to phrase-first.** The README and README-SSR documented `$t(category, phrase, params?)`, but the `TFunction` type, the runtime discriminator, and the base SDK were all already phrase-first — `$t(phrase, category?, params?)`. Examples and the demo's call sites were flipped to match.
- `detectPreferredLocale` description corrected: it falls back to the user's top preference and returns `false` only when nothing is detectable.

### Removed

- **The `contentBlocks` re-export.** Mirrors the base SDK refactor that deleted the signal — `sTranslations` became the single source of truth for whether the backend knows a content block. No behavioral change in any component.

### Infrastructure

- npm **trusted publishing** (OIDC) with provenance, scoped to the `npm-publish` GitHub Environment so the token can only be minted from tag-ref runs; PR/push CI running `svelte-check` + `vitest`; the local release script now stops after creating the GitHub Release.

> **Why this missing entry mattered.** `<Phrase>` and `<DontTranslate>` were added here and documented nowhere for the next four minor releases — no README sections, and the `index.d.ts` "Public API" header kept listing only `<Translate>` — until 3.5.0. Readers, including an AI agent integrating the SDK, concluded the components did not exist and reached for `<Translate>` on content that needs `<Phrase>`, silently breaking pluralization. The stale `contentBlocks` reference in `CLAUDE.md`, fixed in the same release, traces to the same gap: this entry is where its removal should have been announced. A missing changelog entry is a documentation defect that causes further documentation defects.

---

## 3.0.0 - 2026-05-19

### BREAKING CHANGES

- **The `$_['Category']['Phrase']` proxy is removed**, replaced by `$t(category, phrase, params?)`. The phrase remains both the lookup key and the base-language default, but the function-call form unlocks interpolation, future ICU plural/select support, and compile-time-checked parameters via template-literal types.
    - **Migration:** `$_['UI']['Title']` → `$t('UI', 'Title')`. Two-arg, 1:1 with the previous category/phrase. Codemod-friendly.
    - **Staying on the proxy?** Consumers who want to keep the `$_['Cat']['Token']` syntax must pin to `2.x` or install via the `v-last-proxy-compat` dist-tag (`npm install langsys-js-svelte@v-last-proxy-compat`). 2.x will receive only critical security fixes going forward.
- **`langsys-js-svelte` is now a thin Svelte binding over the framework-agnostic [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript) package.** All of the previous internals (Translations class, LangsysAppAPI, stores, utility code, type definitions) live there now. This package contains only Svelte-native concerns: a `LangsysApp` wrapper that accepts a `Writable<string>` for the user locale, the `t` / `currentlyLoadedLocale` / `sTranslations` / `contentBlocks` re-exports typed as Svelte `Readable`s, and the `<Translate>` Svelte 5 component.
- **Legacy parameter-based `LangsysApp.init(projectid, key, store, …)` is removed.** The config-object form (deprecated in 2.0.0) is now the only signature. Callers still on the old form must migrate to `LangsysApp.init({ projectid, key, UserLocaleStore, … })`.

### Added

- `$t(category, phrase, params?)` function-call translation API.
- `{name}`-style placeholder interpolation. Allowed value types: `string | number | Date | boolean`; `Date` serializes to ISO 8601.
- **Compile-time-checked params** via template-literal types. Placeholder names are extracted from the phrase string literal; the params object must satisfy them exactly. Missing or extra keys are TypeScript errors at the call site.
- `t: Readable<TFunction>` — Svelte store wrapping the underlying reactive primitive. `$t(...)` re-renders subscribed templates whenever translations or the loaded locale change.
- Re-exports of `currentlyLoadedLocale`, `sTranslations`, `contentBlocks` typed as Svelte `Readable`s.
- Type re-exports: `TFunction`, `TranslationParams`, `ParamPrimitive`, `ExtractParamKeys`, `ParamsFor`, `TArgs`, plus all the previous `iCategory`/`iCountry`/`iLocale`/etc types now sourced from `langsys-js-typescript`.

### Changed

- `LangsysApp.init` accepts a Svelte `Writable<string>` for `UserLocaleStore` and adapts it internally to the base SDK's `Signal<string>`. From the caller's perspective the contract is unchanged.
- All previously stale `@typescript-eslint/*: off` rule overrides removed — the new wrapper code is precise enough not to need them.
- `prettier` invocations updated to drop deprecated `--plugin-search-dir .` flags.

### Removed

- Old proxy-based `_` export and the entire `TranslationsAccessor` machinery.
- Legacy parameter-based `LangsysApp.init` signature (deprecated in 2.0).
- `src/lib/interface/`, `src/lib/js/`, `src/lib/service/`, `src/lib/store/` — all functionality now lives in `langsys-js-typescript`.
- `@macfja/svelte-persistent-store` and `@ungap/structured-clone` dependencies (no longer needed; persistence and cloning handled by `langsys-js-typescript`).
- `watch` devDep + accompanying `npm run watch` script. `svelte-package` has built-in watch mode.

### Added (deps)

- `langsys-js-typescript` — the framework-agnostic base SDK this package binds to.

---

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
