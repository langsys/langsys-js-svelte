## Unreleased

### Changed

- **`_dev_/enumerate-core-surface.mjs`** — publishes the core-surface measurement rather than
  leaving it as a one-off command. Prints the module path it actually imports plus that checkout's
  branch and SHA (the shared clone has moved four times this ticket), carries a `--self-test`
  positive control that hides a real member and proves the detector detects, and prints a
  **PRIVATE-IN-DTS** column — the column that turns "13 dropped members" into "13 members
  TypeScript erased, 0 public dropped".

- **`LangsysApp` is now a Proxy over the core singleton rather than a hand-enumerated wrapper
  class.** Only `init` and `setWriteGrant` are overridden — the two that adapt Svelte stores;
  everything else forwards, bound to the core so destructuring keeps working and getters resolve
  against the real instance.

    The reason is forward-looking, and the fleet report that prompted it does not hold here. A
    runtime prototype scan shows 33 core members against the old wrapper's 20, which reads as
    thirteen dropped methods — five matching names other bindings reported missing. **All thirteen
    are `private` in the core's `.d.ts`.** TypeScript's `private` is erased at runtime, so a
    prototype scan surfaces implementation detail and cannot distinguish it from API. The old
    wrapper exposed every public member; no public surface was ever unreachable.

    What the change actually buys: a public member the core adds later is exposed automatically,
    where the enumerated version would have omitted it silently with nothing failing. Pinned by
    per-member assertions generated from the core prototype, an exactly-two override set, and an
    unbound-forwarding check; both mutations red (hiding an override reds 1, dropping a forwarded
    member reds 2).

### Documentation

- **Removed a placeholder test that was being counted as coverage.** `src/index.test.ts` asserted
  `1 + 2 === 3` — scaffold from the project template, testing nothing about this package and
  incapable of failing meaningfully, while contributing to the suite count quoted in docs.
  `src/lib/surface.test.ts` now covers the package index by asserting which exports are the core's
  own objects and which is deliberately wrapped.

- **Discoverable content belongs in `+page`, not `+layout`.** Discovery records a miss per URL,
  and a layout does not remount on a client-side navigation — measured at **+0 re-entries** across
  a real navigation, with the layout provably not remounted. So a layout-level phrase is attributed
  to the first URL of the session and no other. Nothing is lost (the phrase registers, the first URL
  is reported), but discovery cannot tell you which _other_ pages contain it. A property of the
  rendering model rather than of the SDK, and equally true of any persistent component.

- **`<DontTranslate>`'s `data-ls-dont-translate` attribute is inert and now says so.** Exclusion is
  decided entirely by `translate="no"` — the base SDK's `isTranslationExcluded()` checks that and
  `data-notrans`, and does not know the bespoke attribute at all. Documented as presentational with
  a deprecation note rather than removed: this line is published and a `[data-ls-dont-translate]`
  selector may exist in consumer CSS, so removal belongs to a release wave with its own entry.

### Fixed

- **Locale canonicalization was documented backwards, in shipped source and in the README.**
  `src/lib/index.ts` and `README.md` both said `canonicalizeLocale` produces `en-US`. It produces
  **`en-us`** — `Intl.getCanonicalLocales()` followed by `.toLowerCase()`, on both the valid and
  the invalid-tag branch. Lowercase is the wire form the SDK spec requires (WIRE-3) and the form
  used internally for cache keys and equality, so a host store holding `en-US` resolves to the
  same catalog entry rather than fetching twice.

    Found by calling the function, not by re-reading either the doc or the code — the same way two
    sibling SDKs found the identical defect in a test double and a docstring. Now pinned by
    `src/lib/locale.test.ts`, which asserts against the **re-exported function**; a fixture that
    restated the expected casing would have agreed with the wrong doc perfectly.

    The 3.2.0 entry below still contains the old claim. It is left as released history rather than
    rewritten — correcting a shipped section is the defect corrected earlier on this branch.

- **`<Phrase>` hardcoded the core's marker attribute.** The host emitted the literal
  `data-ls-phrase`. `Translate` skips a marked subtree via the core's `isPhraseMarked()`, which
  reads the core's own constant — so a literal that drifted from it would have stopped the host
  being skipped and split a markup-bearing run, silently, which is precisely what `<Phrase>`
  exists to prevent. The attribute **name** now comes from the imported `PHRASE_MARKER_ATTR`.

### Added

- **Write-key gating and content discovery (838).** Public API keys are read-only. Whether a
  session may register newly-discovered content is now decided **by the server, per session** —
  the same key is write-enabled from an allow-listed address and read-only from everywhere else,
  so nothing on the client can infer it. Three additions carry this:
    - `writeEnabled` — a `Readable<boolean | undefined>`. The tri-state is load-bearing:
      `undefined` means _not known yet_, and is what the store reports during SSR and throughout
      hydration. Treating it as `false` tells a write-enabled session it is read-only, which it
      cannot recover from without a reload.
    - `writeGrant` on `init()` — for authenticated apps, whose backend mints a short-lived JWT at
      login that the SDK sends as `X-Write-Grant`. Accepts the base SDK's `string` or provider
      function, **plus a Svelte store**, which is this binding's only addition to the surface.
      The store is resolved per request and cached nowhere, so `grantStore.set(next)` takes effect
      on the very next request — a token that expires while the app runs is the normal case, not
      the exception.
    - `setWriteGrant()` — for when the token only exists after `init()`. It re-authorizes, so the
      server re-evaluates the session; `await` it if you need `writeEnabled` settled.

    `writeEnabled` is deliberately the one store **not** re-exported by reference. Reading the base
    signal during hydration is a mismatch hazard specific to SvelteKit: a universal `load` re-runs
    on the client and is awaited _before_ mount, so `await LangsysApp.init()` in a load resolves
    authorization before the first client render. The wrapper changes only _when_ the value is
    observable, never what it is. Everything else (`t`, `currentlyLoadedLocale`, `sTranslations`)
    is still the base signal itself, so no code in this package sits in the catalog-miss path.

### Fixed (documentation)

- **`ssrTokenStrategy: 'client'` does not queue on the server and flush from the client.** Both
  `README.md` and `README-SSR.md` described behavior that cannot occur. Under SSR the server
  instance declines to collect at all (`shouldQueueForWrite()` returns `false`), and the
  post-hydration flush runs in the browser's module instance — a different object in a different
  process, with no channel carrying a queue client-ward.

    The consequence is worth stating plainly because it is invisible: **content that renders only
    on the server is discovered by neither lane**, with no error, no failed request, and no hint,
    since SSR does not hint. `'server'` covers those pages, and now carries its own precondition in
    the same breath rather than as a footnote — the flush originates from the origin server's IP,
    which must be allow-listed or every registration is silently refused.

---

## 3.6.17 - 2026-09-01

### Changed (documentation)

- **The `experimental.async` caution is now measured rather than reasoned, and the flag alone turns out not to be the trigger.** 3.6.13 through 3.6.16 asserted that turning on `compilerOptions.experimental.async` "switches the renderer to an async path that genuinely awaits mid-tree" and so reintroduces cross-request bleeding. That was derived from reading the renderer, not from a run — and an earlier harness had measured 0 bleeds with the flag on, which looked like a contradiction. Both were right about different shapes. Measured on Svelte 5.55.8 with four locales rendering concurrently:

    | Shape                                         | `experimental.async` | Wrong-locale responses |
    | --------------------------------------------- | -------------------- | ---------------------- |
    | No `await` in the tree                        | off                  | 0 / 4                  |
    | No `await` in the tree                        | on                   | 0 / 4                  |
    | `await` in a parent's script, read in a child | on                   | 0 / 4                  |
    | `await` then read **in the same script**      | on                   | **3 / 4**              |

    The compiler hoists an await into `$$renderer.run([...])` and keeps rendering children synchronously, so an await in a parent with the read in a child does not break anything — that is what the earlier 0 measured, with the flag genuinely on (the compiled output imports `svelte/internal/flags/async`, and the same source fails to compile without it: `experimental_async`). What breaks it is the read landing _after_ the await in the same closure, which Svelte defers into the async continuation. The caution now states that condition instead of blaming the flag, and keeps the conclusion: with the flag on, the pattern is not safe.

- The earlier claim that "there is no component-tree construction in Svelte that puts an await between the seed and the read" was false, and is the reason the weaker conclusion held for four releases. The shape that does it is the most natural one to write.

---

## 3.6.16 - 2026-09-01

### Fixed (documentation, types)

Six defects in 3.6.15, found by a correctness review of that commit. The release that inlined a safety condition so it could not be missed introduced a sentence denying it.

- **`README.md` contradicted itself two lines apart.** The new SSR block ended "Both failures are invisible from a cold process — with nothing cached yet, the bad request falls back to base language and looks correct" — directly under a bullet stating that a nullish catalog throws "a 500 during SSR, and the same throw again at hydration". A 500 on the first request is the loudest signal there is. `README-SSR.md` scopes that invisibility to the skipped-seed case only; generalizing it to "both" while inlining inverted it. A reader would conclude the null-catalog case needs warm load testing to detect, and deprioritize the `?? {}` guard the bullet exists to sell. The two failure modes are now described separately, with the asymmetry stated: a skipped seed is silent until the process is warm, a nullish catalog is loud but only once a fetch actually fails.

- **The inlined conditions were presented as exhaustive, and the pointer to the ones left out was deleted in the same edit.** "Two conditions ride along with that pattern, and neither is optional" omitted the third, which `CLAUDE.md` records as voiding the guarantee entirely: `compilerOptions.experimental.async`. `README.md` still said flatly that the server renderer "cannot yield" while `README-SSR.md` — now shipping beside it in the same tarball — says a one-line config change makes it await mid-tree. Now three conditions, "in its default mode" restored to the safety claim, and the pointer to the guide's full limits put back.

- **The store table named a type consumers cannot import.** `Signal<T>` was not in `index.ts`'s type re-exports, so `import type { Signal } from 'langsys-js-svelte'` failed with TS2305 against the published 3.6.15 — verified by compiling against both tarballs. The previous `Readable<T>` was at least importable from `svelte/store`. This also broke this repo's own rule that consumers should not reach into `langsys-js-typescript` for routine types. `Signal` is now re-exported. `docs-api-coverage.mjs` did not catch it: it validates names in code fences, not types named in prose or tables.

- **`README-SSR.md` shipped pointing at two files that do not.** It told installed users to "see `CLAUDE.md`" (a maintainer-only file, which also leaked its existence to consumers) and to consult `CHANGELOG.md` for breaking changes. The same defect the release was fixing, recreated by the fix. Also corrected two long-standing dead `./CHANGELOG.md` links in `README.md` itself — the doc that always shipped had carried them the whole time. All now absolute GitHub URLs.

- **The failed-fetch sample was not runnable.** Bare statements under a `+layout.server.ts` header with no enclosing `load`, calling an undefined `fetchCatalog`. Rewritten as a real `load` that mirrors Step 1's — including `response.ok`, since a non-2xx is not an exception and would otherwise put `undefined` into the catalog by the path the section warns about. The first rewrite of it dropped `projectId`/`apiKey` from the return, which lines further down read; caught before commit, and it is the same defect class that shipped in 3.6.11.

- **`index.ts` still asserted the corrected claim.** The comment above the store exports said they are "re-exported under Svelte-native types so IDE hovers and consumers see the familiar shape" — no re-typing happens, hovers show `Signal<T>`. And the shipped `TStore = Readable<TFunction>` was documented as "the narrow type for the `t` re-export so consumers see it as a Svelte Readable", which it is not, since it is not applied to `t`. `TStore` is unchanged (removing a public type is breaking) but now documents what it actually is.

---

## 3.6.15 - 2026-09-01

### Fixed (documentation, packaging)

- **`README-SSR.md` was not in the npm tarball.** `files` listed only `dist`, and of the docs npm auto-adds only `README.md` (alongside `LICENSE` and `package.json`) — so the shipped README pointed at `./README-SSR.md`, a document an installed user did not have. That guide is where the failed-fetch reset rule lives, which made the reachable path: install, read the README, implement the body seed correctly, and never encounter the condition that stops a failing locale rendering in the previous request's language. `README-SSR.md` is now listed in `files`, verified against `npm pack`, and the reset rule is inlined into `README.md` as well. (3.6.16 corrects the overreach in that last clause: only two of the pattern's three conditions were inlined.)

- **The "Reactive stores" table contradicted the SSR section ten lines below it.** It typed `currentlyLoadedLocale` and `sTranslations` as `Readable<T>` and annotated the catalog "Rarely needed in app code" — while the next section describes seeding that exact store as the whole mechanism for server-rendering translated copy. Both are `Signal<T>` with a public `.set()` (verified against the `langsys-js-typescript@0.6.5` tarball). The table now types them accurately, notes they are writable and process-global, and explains that `Signal` satisfies Svelte's `Readable` contract so `$store` still works. 3.6.14 corrected this same claim in the `index.ts` JSDoc and `CLAUDE.md` and missed the README table; the `t` row's type is corrected here too, with "never write to it" stated rather than implied by a narrower type.

- Both defects were found by the Langsys skill agent diffing the published tarball against its own SvelteKit guidance. It had carried the identical `Readable` / "rarely needed" annotation, and reports that single line hid the seeding path from it for months.

---

## 3.6.14 - 2026-08-30

### Fixed (documentation)

- **`sTranslations` and `currentlyLoadedLocale` were described as read-only.** Both the `index.ts` JSDoc — which ships in the tarball and is what IDE hover renders — and `CLAUDE.md` typed them as `Readable<T>` and said only "read with `$store` syntax". They are `Signal<T>` and writable, and `README-SSR.md` now documents a pattern that depends on writing to them, so the API description contradicted the guidance. Both now say they are writable, that the SSR server-rendering pattern depends on it, and that they are process-global.

- `CLAUDE.md` also records the seeding pattern's boundaries so they are not restated loosely later: safe in a layout component body (0 wrong-locale responses in 400), unsafe anywhere that `await`s before rendering (70 of 80), and voided entirely by `compilerOptions.experimental.async`. Plus which docs ship in the tarball versus GitHub-only, since that decides whether a fix needs a publish.

---

## 3.6.13 - 2026-08-30

### Fixed (documentation)

- **3.6.11's seeding sample crashed. A reader following the guide got a 500 on every page.** The `+layout.svelte` sample read `data.catalog`; Step 1 of the same guide returns `translations`, and every other reference in the file uses `data.translations`. Worse than rendering nothing: `$t()` reads `catalog[category][phrase]` and the optional chain is on the _second_ hop, so a nullish catalog throws a `TypeError` on the first lookup — during SSR, and again at hydration. Verified by probing the published SDK: `set(undefined)` and `set(null)` both throw, `set({})` correctly falls back to the base phrase. Found by a correctness review of the commit; the whole section has been rewritten around a sample that resolves and a `?? {}` guard.

- **The failed-fetch recipe contradicted the warning 60 lines above it, and produced the same crash.** It wrote the process-global signals from `+layout.server.ts` — an async server module that awaits before rendering, which is exactly the placement the section itself measures at 70/80 wrong-locale responses — and set `catalog = null`, which the layout body then wrote into the global. Rewritten: the fallback belongs in `load` and must return `{}`, and the component body must seed **unconditionally**, because a request that skips the seed renders with whatever the previous request left behind.

- **"`render()` returns a string, not a promise" was false, and the safety claim was over-general.** It returns a `RenderOutput` — `body`/`head` plus a `then` method. The conclusion holds in Svelte's default synchronous mode, and `{#await}` genuinely never resolves server-side there. But `compilerOptions.experimental.async` switches the renderer to a path that awaits mid-tree, and SvelteKit already awaits the result accordingly — so a one-line config change, with no change to any component, silently reintroduces the cross-request bleeding the section promised was impossible. Claiming it "survives refactors / is a property of the renderer" was the dangerous part. Now stated as mode-conditional with an explicit caution.

- **The body seed is one-shot on the client, which the guide did not say.** A Svelte component body runs once per instance and SvelteKit keeps the root layout mounted across client-side navigation, so `/it-IT → /es-ES` left the first locale's catalog in place. Measured: body-seed-only renders `Ciao` after navigating to Spanish; body seed plus an `$effect` renders `Hola`, and the effect does not disturb the server render since effects do not run during SSR. The sample now carries both, and calls `init()` — the previous one silently dropped it, which would also have cost locale switching, missing-token registration, and the `markLoaded` priming that prevents a redundant client fetch.

- **Three sections still asserted the opposite of the new pattern.** The `<head>` SEO workaround, the "not on this list" line under Benefits, and the `curl`-cannot-verify troubleshooting entry all assume `$t` renders base language on the server. Each is now scoped to the `onMount` pattern, with the inverse noted — under the body seed, base language in `curl` output is a genuine failure signal rather than noise.

- **`translationsLoadingPromise`: corrected the sample, the guidance, and the reason.** The `$effect` example referenced only the promise, which is a plain class field and not reactive, so it registered no dependency and ran once at mount — never on the locale change it was meant to handle. Guidance replaced with the both-edges framing: the promise is the only "it ended" signal, a locale _match_ the only "it worked" signal, failure must not be derived from a mismatch (the locale is written only on the success path, and inside a 100 ms timer, so a mismatch is also the normal state for ~100 ms after a successful load), and **there is no reliable failure signal** — an error state needs a caller-supplied timeout. Raised by the React binding agent, who shipped and then corrected the same advice twice.

- **Corrected 3.6.12's stated mechanism.** That entry named `readyResolve()` while explaining why the promise settles. `readyResolve` resolves `readyPromise`, exposed via `ready()` and consumed by the vanilla `Translate` and `Phrase` classes — a different promise from `translationsLoadingPromise`, which is `change()`. `readyPromise` is also one-shot, so reasoning from that sentence yields the opposite of the truth: that only the first failure resolves and later ones hang. The actual reason is that `getTranslations()`' error branch returns normally instead of throwing, so the awaited promise resolves either way. The observable claim was right; the explanation was not.

---

## 3.6.12 - 2026-08-30

### Fixed (documentation)

- **`translationsLoadingPromise` was documented as meaning "the new translations arrived". It does not.** Verified in the published `0.6.5` dist: `change()` awaits `getTranslations()`, whose error branch logs, calls `readyResolve()` and returns _before_ writing a catalog — so the promise resolves identically on success and on failure. It also resolves without any fetch when the locale is unchanged and within the 60-second cache window. Nothing about the promise settling distinguishes "loaded" from "failed and gave up". The README now says to treat it as "the attempt is over" and to check `sTranslations` / `currentlyLoadedLocale` if the callback actually depends on the copy being present. Raised by the React binding agent, who found the same overstatement in their own docs.

---

## 3.6.11 - 2026-08-30

### Fixed (documentation)

- **`README-SSR.md` said server-rendered translated copy was not achievable. That was true of the pattern it documented and false as a statement about SvelteKit.** `init({ initialTranslations })` in `onMount` genuinely cannot server-render body text. Seeding `sTranslations` / `currentlyLoadedLocale` synchronously in a **layout component body** can, and does. Measured on a production `adapter-node` build with the concurrency harness the React binding published, so the numbers are comparable across bindings:

    | placement of the seed                                | requests in flight | wrong-locale responses |
    | ---------------------------------------------------- | ------------------ | ---------------------- |
    | layout component body                                | 400                | 0                      |
    | layout component body, base locale excluded          | 350                | 0                      |
    | `hooks.server.js` `handle()`, awaiting before render | 80                 | 70                     |

    Writing per-request data into process-global signals is normally unsafe. It holds here for a structural reason worth stating rather than assuming: **Svelte's server renderer cannot yield.** `render()` from `svelte/server` returns a string, not a promise, so a layout and the page beneath it render in one uninterrupted synchronous pass and no other request can seed in between. That is a property of the renderer, not of any particular app, so it survives refactors. React and Vue have no equivalent guarantee — both bleed when anything suspends between the seed and the read.

    The guide now documents both patterns, and carries the placement warning: a `hooks.server.js` seed is the natural place to put per-request setup and is the one placement that breaks.

- **Documented the stale-locale flash, and that the same seed placement fixes it.** `sTranslations` is persisted to `localStorage` and re-seeded from it at module load, before `init()`; `currentlyLoadedLocale` is not persisted, so the stored catalog carries no locale tag and nothing can tell it is stale. A returning visitor's first paint renders the locale they previously viewed. Under SSR this is worse rather than better — correct server HTML is replaced at hydration by the stale locale, which lands on exactly the crawler audience the seeding exists for. The component-body seed closes it because it runs during the hydration render pass before any child reads; `init({ initialTranslations })` in `onMount` does not, because the stale paint precedes it.

- **Documented the failed-fetch case.** An early return on a failed catalog fetch leaves the process-global signals holding the previous request's catalog, so the failing locale renders in that language under its own `<html lang>` — mislabelled rather than untranslated. Invisible from a cold process and only appears once any locale has succeeded, which in a long-lived server is the normal state. The guide now shows an explicit reset instead, verified stable across alternating warm and failing requests.

---

## 3.6.10 - 2026-08-21

### Infrastructure

- **`npm run lint` works again.** It had been failing outright — not reporting findings, refusing to run — for two independent structural reasons, so the gate has been enforcing nothing. `prettier-plugin-svelte` was on the 3.x line, which cannot parse the AST Svelte 5.55 emits and dies with `unknown node type: Script` on every component; upgraded to 4.x, which declares `svelte: ^5.0.0`. Separately, ESLint 10 does not read `.eslintrc.cjs` or `.eslintignore` at all, so the config was inert; ported faithfully to `eslint.config.js` (same extends, same parsers, ignore list carried over plus `dist`), and the legacy files removed rather than left to look authoritative.

    Verified with a positive control rather than a clean run: ESLint inspects 14 files including all four `.svelte` components, and injected unused-variable violations are caught in both a `.ts` and a `.svelte` file. A green lint that lints nothing is the failure this was already in.

- **Prettier no longer rewrites the code samples inside the docs.** `embeddedLanguageFormatting` defaults to `auto`, which reformats fenced Svelte samples in `README.md` at `printWidth: 160` — joining separate elements onto one line and pulling trailing HTML comments onto their own. It is scoped `off` for markdown only: setting it globally breaks `prettier-plugin-svelte`, which relies on embedded formatting to print `<script>` blocks and fails with the same `unknown node type: Script`. Verified both ways, and the reasoning is a comment in the config so the next person to simplify it does not rediscover it.

    Worth recording how this entry was caught: the first draft wrote the fence marker inline in prose, Prettier read it as an actual fence delimiter, and scrambled the backtick spacing across the rest of the paragraph — mangling the changelog entry about Prettier mangling markdown. Don't write a bare fence marker inside a sentence.

- **CI now runs `npm run lint`.** It did not before — the workflow ran `check`, `test` and the two coverage scripts, but never the lint gate. That is why both breakages could sit there unnoticed: the script was broken, and nothing invoked it, so its failure had no way to surface. A gate no workflow calls will rot again the same way, so the step is now first in the `check` job.

- Repo formatted to that config. Cosmetic only — in the docs it is table padding and emphasis style with no fenced code altered; in `src/` it collapses multi-line prop destructuring under the 160-column width. `npm run check`, the test suite, `publint` and both coverage checks pass unchanged.

---

## 3.6.9 - 2026-08-21

### Fixed (documentation)

- **Corrected the stated mechanism behind client-only `{#await}` registering nothing (shipped in 3.6.8).** The README said the host is _empty_ when `<Translate>` tokenizes, so the SDK takes an early return that marks the block parsed without tokenizing. Both halves were wrong. Captured off the live instance: the host holds **six** child nodes — Svelte's anchor comments are child nodes before any text renders — so the empty-host early return is never the path taken. The block tokenizes a subtree of pure anchors, produces zero tokens, and its token list stays empty for the life of the block.

    The user-facing conclusion is unchanged and now rests on better evidence: `tokens` is empty whether or not the catalog has loaded, measured both ways, rather than on a phrase-lookup spy that — as the base-SDK agent and I established — was watching the wrong seam and could not have detected the path it was cited for. The advice was never affected; only the explanation was, which is the same defect class as the `<Phrase>` correction in 3.6.6.

---

## 3.6.8 - 2026-08-21

### Fixed (documentation)

- **3.6.7's scope table said client-only `{#await}` "updates"; that reads as safe and it is the opposite.** Verified by spying on the SDK's phrase lookup: client-only, it performs **zero** lookups — the empty-`childNodes` early return in `tokenizeContent` marks the block `parseComplete` _without_ tokenizing it, and nothing re-enters, so neither the placeholder nor the real content is ever registered. Hydrated, the same component logs `["loading"]`. So the cell that looked like the working one is the silent total failure, and enabling SSR converts invisible non-registration into a visible freeze. Raised by the skill agent after they read `tokenizeContent` independently.

- **Store-driven updates freeze identically to runes.** Measured `{$msg}` and `{#if $flag}` with a `writable` store: both freeze, client-only and hydrated, exactly as their rune equivalents do. The update mechanism is irrelevant — only the token count is. Worth stating because store subscriptions are the older and more widespread pattern in Svelte codebases, so the affected population is larger than a runes-only reading of 3.6.7 suggested. Requested by the skill agent, who ranked it above my own estimate of its importance; they were right.

---

## 3.6.7 - 2026-08-21

### Fixed (documentation)

- **Documented that dynamic content directly inside `<Translate>` freezes the block.** When a subtree tokenizes to exactly one phrase, the base SDK writes the translation back with `element.innerText = …`, which replaces every child of the host — including the `<!--[-->` / `<!--]-->` anchors Svelte 5 uses to locate the block. Svelte's next update then targets detached nodes, succeeds silently, and changes nothing. No error, no warning; the block is stuck on whatever it first rendered.

    Reported by the skill agent from a production SvelteKit deployment, with the scope left open as explicitly-unmeasured inference. Measured here against `0.6.5`, running the real component in jsdom: `{#if}` toggles and a lone reactive expression freeze **in client-only apps with no SSR at all**; a subtree with two or more phrases is unaffected, since it takes the other branch. `{#await}` is the one that needs care in the telling — it freezes under hydration but _survives_ a client-only mount, because the host is still empty when the block tokenizes so no write-back happens. That is timing luck, not safety, and the docs say so rather than presenting client-only as a safe configuration.

    The fix for users is to keep the async or conditional boundary outside the block and wrap the resolved content; `params` with `%name%` remains the supported path for values that change. The warning also names the quieter half: the loading placeholder is what reaches the catalog, the real content never does, and every block sharing that placeholder collapses onto one entry. The write itself is base-SDK territory and is filed there; this is the warning that stands until it lands.

---

## 3.6.6 - 2026-08-21

### Fixed (documentation)

- **3.6.5 gave `<Phrase>` the wrong reason for the right advice.** The new `%name%` text said a bare `{name}` "registers its own content block" — that is `<Translate>`'s mechanism, and `<Phrase>` does not use it. Verified in the published `0.6.5` dist and measured on a live DOM: `<Translate>` tokenizes the subtree and keys a content block on the token array, so the baked value changes the `custom_id`; `<Phrase>` encodes the subtree to one string via `encodeRichText` and calls `Translations.t(phrase, category)` — a plain phrase lookup, no content block and no `custom_id` — so the value lands directly in the lookup key. `%n%` holds `"Based on {n} {m0o}reviews{m0c}"` across every value; `{n}` produces `"Based on 0 …"`, `"Based on 1 …"`, one per render. The advice was never wrong, only the stated reason — which is the kind of detail that gets quoted onward as fact. Caught by the React binding agent, who nearly copied their own `<Translate>` explanation across.

- **Documented that the two paths handle adjacent text oppositely.** `_walkForTokens` pushes one token per text node and never coalesces, so the arity is identity-bearing. `encodeRichText` does the reverse — it concatenates adjacent text (`out += node.nodeValue`) and collapses whitespace across the whole phrase. Measured on the same two-text-node span: `<Phrase>` yields `"Hello world"`, `<Translate>` yields `["Hello","world"]`. Two identity mechanisms with opposite text handling in one package, which matters for anyone implementing server-side rendering against either.

---

## 3.6.5 - 2026-08-21

### Fixed (documentation)

- **The `%name%` guidance explained the mechanism but not the damage.** The README said a bare `{name}` in `<Translate>`/`<Phrase>` markup is compiled away by Svelte "silently breaking translation while still looking right in the base locale" — true, and still an undersell. The substituted _value_ becomes part of the captured phrase, so **every distinct value registers its own content block**: `You have {count} items` mints separate catalog entries for `You have 0 items`, `You have 1 items`, and so on, one per value the component ever renders, each needing its own translation and none reusable. Measured against the shipped tokenizer in a jsdom DOM — `%count%` holds one `custom_id` (`c0ca822f…`) across every value, while the brace form produces a new one each time (`a503b1aa…`, `d813859b…`, `372154fa…`, `04e693fa…`). The `<Phrase>` JSDoc had the same gap and gets the same fix, since that is what IDE hover surfaces.

    This matters for whether a reader bothers to act. "Interpolation breaks" sounds like something testing would catch; a catalog quietly filling with near-duplicates over weeks is precisely the class where nothing looks wrong until a translator opens it. Raised by the React binding agent, who found the identical framing gap in their own README.

- **Corrected a claim shipped in 3.6.4: a rejected catalog fetch is _not_ debug-gated.** `README-SSR.md` said a 422 leaves you with "no console output at all" unless `debug: true` is set. Wrong. `Logger.log()` checks `debugEnabled`; `Logger.warn()` and `Logger.error()` do not. Verified by executing the published SDK against the live API with `debug: false` and a locale the project does not have — two lines print every time, `[Langsys Warning] LangsysAppAPI failed to query {…}` and `[Langsys Error] Error HTTP 422: Unprocessable Content`. The real weakness is narrower and is what the guide now says: neither line names the offending locale or the project's valid targets, so it is easy to read past.

    This was inherited from a peer agent's report and repeated without executing it, which is the same failure the 3.6.4 corrections were about — the previous entries were verified against the live API and the dist, this one was not. Three adjacent behaviors are gated three different ways: `canonicalizeLocale`'s invalid-tag warning _is_ debug-gated, the fetch rejection is not, and the seeding XOR has no diagnostic at all. Reasoning from one to the next is what produced the error.

### Infrastructure

- **CI now fails when the docs name an API that does not exist.** Markdown does not typecheck, so a code sample can call a method the SDK never had and ship. The langsys-skill agent hit exactly that — three SSR tracks calling two different invented locale helpers, the second introduced by the commit that fixed the first. `_dev_/docs-api-coverage.mjs` checks every `LangsysApp.*` / `LangsysAppAPI.*` member and every named import in `README.md`, `README-SSR.md` and `CLAUDE.md` against the built `dist/index.d.ts` — the surface a consumer's typechecker actually resolves. Our docs were clean, which is worth stating plainly: nothing had been verifying it.

    Two traps, both hit while building it. The allowlist must include **class members**, not just the `export { … }` statement — `init`, `refresh`, `detectPreferredLocale` and the `getLocales*` family are all members of `LangsysAppSvelte`, and class members never appear in an export statement. A checker built from that statement alone does not under-report; it flags the entire real API as invented, which reads as a broken tool and gets switched off. Reported by the skill agent after their own guard did this. Separately, the first draft here matched `export { … }` but not `export type { … }`, and reported five real re-exported types as missing — the same failure, caught by a positive control before it reached CI. The checker is now verified in both directions: clean on real docs, and catching an injected fake method, fake API member and fake import.

---

## 3.6.4 - 2026-08-21

### Fixed (documentation)

- **The SSR guide claimed two things it does not deliver, and both were invisible to every cheap check.** `README-SSR.md` promised "better SEO with server-rendered translations" and "no flash of untranslated content". Neither holds for body copy: `init()` runs in `onMount`, which does not execute during SSR, so the catalog is empty while the server renders and `$t()` falls back to its first argument — the base phrase. The client corrects it at hydration, which _is_ the flash the second bullet said was gone. Measured on a production `adapter-node` deployment serving Italian: 5,031 characters of visible SSR body text, 100% English, alongside a 133 KB inline Italian catalog. The guide now states the real benefit — one catalog fetch instead of two, translations ready at hydration, a current catalog per request — and states plainly what it does not do.

- **The guide's server-fetch example used a route that resolves locales differently from the one the SDK calls.** It documented `GET /api/projects/{id}/translations?locale=…`; the SDK calls `GET /api/translations?project_id=…&locale=…`. Verified against the live API with a real project key: the documented route answers `200` for a bare `es`, while the SDK's route answers `422` — _"The locale provided is not a base or target locale for this project"_ — because the project's Spanish is `es-CR` and the current route matches literally. Following the guide therefore produced a populated server payload paired with an empty client catalog, every string rendering as its base phrase. The example now uses the SDK's route and resolves the tag with `detectPreferredLocale(header, supportedLocales)` first.

- **Corrected the reason `init()` belongs in `onMount`.** It is not `document is not defined`. Server-side init _works_ — and then corrupts concurrent requests, because `LangsysApp` is a module-level singleton (`langsys-js-typescript@0.6.5` dist `:991`), catalog state lives in module-level signals (`:255-256`), and `Translations` subscribes to those globals in its own constructor (`:409-410`), so a per-request instance is not isolated either. The distinction is load-bearing: a reader who believes the `document` explanation concludes a `typeof window` guard makes server-side init safe, and it does not. Request-scoped translation is filed with the base SDK as the real fix.

- **README's `detectPreferredLocale` example built `supportedLocales` from `getLocalesFlat()`.** That helper returns every locale Langsys knows — 573 CLDR entries, confirmed against the live endpoint — not the four your project is configured for. Passing it means nearly any `Accept-Language` "matches", so the helper returns e.g. `de-de`, you store it, and the catalog fetch 422s. The example now uses an explicit project locale list and says why.

- **Documented how to get a translated `<head>`.** Removing the SEO claim without offering the alternative would have left readers worse off. `data.translations` is a plain `iCategories` object, so `categories[category][phrase]` resolves on the server with no SDK involvement and no globals — the supported way to translate `<title>`/`<meta>` until request-scoped translation lands.

- **Three failure modes added to troubleshooting**, all from a production deployment. `curl | grep` cannot verify a Svelte integration — body copy translates after hydration, so a healthy page and a completely broken one are byte-identical to any check that does not run JavaScript. A stale `link:`/workspace SDK on the _deploying_ machine renders every string as its category name site-wide while the build succeeds and types pass. And duplicate `hreflang` URL tokens (`zh-Hant` and `zh-Hans` both shortening to `zh`) throw `each_key_duplicate` in a keyed `{#each}`, which blanks **every page** in a SvelteKit app — so adding a locale in the Translation Manager can take a site down with no deploy.

- Removed the troubleshooting bullet "confirm init runs before any rendering that calls `$t(...)`". Under the pattern this guide documents that is impossible — `onMount` runs after the first render — so it sent readers looking for a bug that is the design.

### Infrastructure

- **The release script now refuses to publish when `origin/main` has commits you don't have.** It force-pushes `main` by design (it amends the last commit to embed the version bump), and the existing `--force-with-lease` was providing no protection: the script fetches during its prerequisite checks, which refreshes the remote-tracking ref the lease compares against, so a commit someone else had pushed was already "expected" and the lease permitted destroying it. Reproduced before fixing — a colleague's pushed commit was silently deleted. The consequence reaches past git: the script also tags, creates a GitHub Release and triggers an npm publish, so dropping someone else's commit would leave their published version, its tag and its signed provenance attestation pointing at a SHA no longer reachable from any branch.
- **The release script's fetch now runs before its own prerequisite checks.** The "do you have unpushed commits?" check previously read a stale remote-tracking ref, which over-reports — so with a stale ref (commits pushed from another machine, or by a co-maintainer) the script would proceed, the divergence guard would legitimately pass with nothing to flag, and it would then amend a commit **already on the remote** and force-push the rewrite. That orphans the tag and provenance attestation of the rewritten commit, with no second party involved and nothing anomalous to notice. Reproduced; fetching first makes the check read reality and abort correctly.

---

## 3.6.3 - 2026-08-16

### Fixed (documentation)

- README notes that `UserLocaleStore` should hold **BCP 47 tags**. Casing and `_` separators are normalized (`en_us` → `en-US`), but a tag that isn't BCP 47 at all (`english`, `en-USA`) passes through best-effort and simply fails to match a catalog — rendering base language, which is indistinguishable from a locale that hasn't been translated yet. `langsys-js-typescript` 0.6.5 warns on this in debug mode; the note points readers at it. Picked up automatically by the existing `^0.6.4` range, so no floor change.
- **README badges standardized and two latent defects fixed.** The license badge queried `npm/l/all-contributors` — a different package's license, which rendered "MIT" only because that package is also MIT, so it looked right while being structurally wrong. Four badges also had empty `[]()` link targets, and the LICENSE link pointed at `blob/master/`, a branch this repo does not have (it resolved only via GitHub's redirect). Badges now sit under the H1 where they are actually read.
- **Removed a stale "future versions will add ICU" note.** ICU MessageFormat has been supported for some time — plural, select, and date skeletons all work today, verified against the published bundle. The section now documents ICU as available, including that Langsys can promote a plain `{name}` phrase to an ICU construct in locales that need one, and how a missing argument resolves.

- The `<Translate>` section now describes `value` as its own mechanism rather than folding it into the attribute list. `value` is translated **only where it is a label rather than data** — on `<button>` and on `<input type="submit">` / `<input type="button">` — and never on other input types, so a text field's value is not rewritten. It is called out separately because `value` does _not_ appear in `TRANSLATABLE_ATTRIBUTES`, so a reader following that pointer would otherwise conclude it is never translated at all. The attribute list itself now also names the `data-*` validation messages. Verified by reading the published bundle.

---

## 3.6.2 - 2026-08-16

### Fixed

- **A missing ICU argument no longer dumps the message source onto the page.** Base SDK floor bumped to `langsys-js-typescript` ^0.6.4. Previously a phrase whose translation used an ICU `select` or `plural` construct rendered its own source when the argument was absent — literally `{name_gender, select, male {Bienvenido} …} Sarah` in place of `Bienvenide Sarah`. Missing `select` now resolves to the `other` branch, and missing `plural` to `other` with `#` shown as `{count}`.

    This is reachable **without any mistake by the caller**: Langsys's ICU promoter can introduce a `select` argument that the source phrase never had — a plain `{name}` becomes `{name_gender, select, …}` in gendered target locales — so an app cannot supply an argument that does not exist in the phrase its developer wrote. Any app translating into a gendered locale could hit it.

    A `null` argument now counts as missing rather than coercing to `0`. That coercion made a failure indistinguishable from valid data: an empty cart and a forgotten `count` both rendered `0 items`.

---

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
