# Conformance — langsys-js-svelte

| | |
|---|---|
| **Spec revision read** | langsys2 83e26af1…, docs/sdk-spec.mdx blob d893ecf6f0d81230d34a22aeedd46e7fc1c6facb |
| **Profiles** | browser, binding, all — derived: binding over langsys-js-typescript |
| **specVersion** | 8.5.8, unpublished |
| **Re-derived at this write** | `git -C ../langsys2 ls-tree 83e26af1fc41aa526f3ff96bc5b50c8d7fcb4e92 docs/sdk-spec.mdx` → `d893ecf6…`. The 129 rule ids are read out of that blob by `node _dev_/conformance-summary.mjs`, not counted from this file. |
| **Binding revision** | `feature/838_write_key_gating_reland`. The commit carrying this file is the one reported to the reviewer; a SHA written here could only name its parent. |
| **Core under test** | `langsys-js-typescript` `bb0198c4bd6040462f2f259ac35df559bb8faba5`, built clean from a detached worktree of that SHA and linked in place of the shared checkout, which carries uncommitted work. `node _dev_/delegation-probe.mjs` prints the checkout it resolves. Every `core row` citation below is read from that SHA's CONFORMANCE.md. |
| **Contract fixture** | `contract-fixture/`, vendored byte-exact from langsys-js-typescript, tree `d7f89b89f911a90a06fc511ac72f8e0e913d4af3` (`git rev-parse HEAD:contract-fixture`). Node 18+, no dependencies. |
| **Shared vectors** | Vendored byte-exact under `vectors/`: `server-message-vectors.json`, blob `7333e3919dac43af81c6c20bfdba974efd79725b`; `snapshot-vectors.json`, blob `594bd77a0289abfdf608508ac93cc9f4c4f88459`; `var-naming-vectors.json`, blob `a4b61ed248118338269ee870c920ee2c77549edf`; `canonicalization-reference.json`, blob `fa32452dc81c4f6c5e62f48e196f48870f1a538f`. |
| **Suites** | unit 268 tests in 20 files (`npm test -- --run`, no network) · contract 22 assertions (`_dev_/contract/verify-contract.mjs`) · E2E 61 assertions, live (`_dev_/e2e/verify.mjs`) · SRV concurrency 6 assertions (`_dev_/e2e/srv-concurrency.mjs`) · SRV-7 scope 9 assertions (`_dev_/e2e/srv-scope.mjs`) · SRV-3 flush 6 + 6 assertions (`_dev_/e2e/srv-flush.mjs`, write and read keys) · Svelte DOM 17 assertions (`_dev_/e2e/svelte-dom.mjs`) · VAR 21 assertions (`_dev_/e2e/var.mjs`, contract) · the published preprocessor entry 4 assertions (`_dev_/preprocess-entry.mjs`, after `npm run package`) |

## What surfaced while writing this

1. **A content block mounted before `init()` never saved.** Svelte mounts a page's blocks before
   the layout's `onMount` calls `init()`; the core read the unknown capability as final. The core
   now waits for the server's answer (core `0d831a5b`), which is what lets VAR-7's zero be
   measured on a block mounted at first paint.
2. **The delegation probe matched the build-time transform** on WIRE-3's and BIND-5's patterns
   (a snake_case helper, a `Map` of names). The transform runs in the bundler, never at request
   time, so the probe leaves `src/lib/preprocess` out, with self-test controls that it is left
   out and would otherwise match.
3. **GATE-10's fixture needs the transform.** Without it a `<Translate>` registers nothing
   (VAR-7), so the fixture's controls, which must register, compile with it.

## Gaps, ranked by cost

1. **VAR-4** — the transform emits markers the core reads at `bb0198c4`, which is not released.
   The binding's release must require the core release that carries the reader (release-wave
   item below).

## Status

| Rule | Status | Tier | Evidence |
|---|---|---|---|
| GATE-1 | delegated | - | core row GATE-1 (implemented, contract) · probe `/write_enabled/` binding 0, core 10 · corroborated through the binding, live: E2E TEST 2 read → false, ip_write → true, write → true; TEST 13 painted value equals the authorize-project body |
| GATE-2 | delegated | - | core row GATE-2 (implemented, contract) · probe `/applyWriteEnabled\|canWrite/` binding 0, core 8 · the binding's `writeEnabled` wrapper keeps unknown as `undefined`, never `false` (stores.test.ts) — surfacing, not a lane decision |
| GATE-3 | delegated | - | core row GATE-3 (implemented, n/a (pure)) · probe `/localStorage\|sessionStorage\|setWriteEnabled/` binding 0, core 5 · the one module-level flag here, `pastHydration` (stores.ts), records hydration timing, not the decision. The GATE-3 carve-out is not taken |
| GATE-4 | delegated | - | core row GATE-4 (implemented, n/a (pure)) · probe `/persistScoped\|catalogCache/` binding 0, core 7 |
| GATE-5 | delegated | - | core row GATE-5 (implemented, contract) · probe `/updateTokens/` binding 0, core 7 |
| GATE-6 | delegated | - | core row GATE-6 (implemented, contract) · probe `/recordMissForDiscovery/` binding 0, core 5 |
| GATE-7 | delegated | - | core row GATE-7 (implemented, contract) · probe `/registerContentBlock/` binding 0, core 8 · every detecting path here is the core's: `$t` is the core signal, `<Translate>` and `<Phrase>` construct core handlers. Documented edge: under `'client'`, content rendered only during SSR feeds neither lane — SSR-1's required non-collection, stated in both READMEs |
| GATE-8 | delegated | - | core row GATE-8 (implemented, contract) · probe `/key_type/` binding 0, core 20 · the tri-state is surfaced unchanged; stores.test.ts "never substitutes false for not known yet" |
| GATE-9 | delegated | - | core row GATE-9 (implemented, contract) · probe `/discoveryBaseLocaleOnly/` binding 0, core 8 |
| GATE-10 | implemented | contract | `_dev_/contract/verify-contract.mjs` against `contract-fixture/` (tree `d7f89b89`), a writer session in a real browser, asserting the double's accepted state. The fixture compiles with the transform, the path a Svelte block registers through, and the core walks up from the host this binding hands `registerBlock`, so each case sits in a different ancestor shape: `data-ls-resolved="it-it"` on the parent, the `data-langsys-resolved` spelling, a bare attribute three ancestors up, and a `<Phrase>` inside a resolved subtree all register nothing; `="false"` on a nearer ancestor opts back out and registers. Controls: an unmarked `<Translate>` and an unmarked `<Phrase>` register, so the double accepted this session's writes; and a bare `$t()` under a resolved ancestor registers, because `t()` is not a DOM reader (GATE-9 governs it). Identity untouched: the resolved block's `data-ls-contentblock` equals the id the core tokenizer re-derives from the host. Mutations: `<Translate>` handing the core a detached copy of its host reds 4; the same for `<Phrase>` reds 1. The reading itself is the core's (core row GATE-10 (implemented, n/a (pure)))  Tree path, mutation: `registerBlock` handed a detached copy of the host reds 4 contract (three resolved `<Translate>` shapes and the resolved `<Phrase>` register) |
| CAT-1 | delegated | - | core row CAT-1 (implemented, n/a (pure)) · probe `/buildTFn\|missingToken/` binding 0, core 37 · `t` is the core's signal by identity (surface.test.ts), so no lookup runs here |
| CAT-2 | delegated | - | core row CAT-2 (implemented, n/a (pure)) · probe `/\blookup\(/` binding 0, core 10 |
| CAT-3 | delegated | - | core row CAT-3 (implemented, n/a (pure)) · probe `/isContentBlockKnown/` binding 0, core 10 |
| REG-1 | delegated | - | core row REG-1 (implemented, n/a (pure)) · probe `/canWrite/` binding 0, core 3 |
| REG-2 | delegated | - | core row REG-2 (implemented, n/a (pure)) · probe `/debounceTimer\|scheduleTokenFlush/` binding 0, core 10 |
| REG-3 | delegated | - | core row REG-3 (implemented, n/a (pure)) · probe `/flushOnTeardown/` binding 0, core 4 |
| REG-4 | delegated | - | core row REG-4 (implemented, n/a (pure)) · probe `/keepalive\|sendBeacon/` binding 0, core 7 |
| REG-5 | delegated | - | core row REG-5 (implemented, n/a (pure)) · probe `/installTeardownFlush\|visibilitychange\|pagehide/` binding 0, core 4 |
| REG-6 | delegated | - | core row REG-6 (implemented, n/a (pure)) · probe `/\[\.\.\.this\.missingTokens\]/` binding 0, core 2 |
| REG-7 | delegated | - | core row REG-7 (implemented, n/a (pure)) · probe `/updateInFlight/` binding 0, core 4 |
| REG-8 | delegated | - | core row REG-8 (implemented, contract) · probe `/consecutiveFailures\|retryNotBefore/` binding 0, core 10 |
| REG-9 | delegated | - | core row REG-9 (implemented, contract) · probe `/batch_limit/` binding 0, core 2 |
| REG-10 | delegated | - | core row REG-10 (implemented, contract) · probe `/noteSendFailure\|createTranslatableItems/` binding 0, core 7 |
| REG-11 | delegated | - | core row REG-11 (implemented, n/a (pure)) · probe `/warnedEllipsis/` binding 0, core 3 |
| REG-12 | delegated | - | core row REG-12 (implemented, n/a (pure)) · probe `/missingToken/` binding 0, core 32 |
| REG-13 | delegated | - | core row REG-13 (implemented, n/a (pure)) · probe `/catalogFetchesInFlight/` binding 0, core 4 |
| HINT-1 | delegated | - | core row HINT-1 (implemented, n/a (pure)) · probe `/discovery/hint/` binding 0, core 1 |
| HINT-2 | n/a (profile: server) | - | Profiles: server. A browser binding cannot be the origin HINT-2 describes, so it cannot fail it |
| HINT-3 | delegated | - | core row HINT-3 (implemented, n/a (pure)) · probe `/recordMissForDiscovery\|location\.href/` binding 0, core 5 · through the binding, E2E TEST 10: a miss on one route, a client-side navigation inside the jitter window, two reports each naming its own URL — observed as the outgoing report, since the endpoint answers 204 either way and keeps nothing a test can read |
| HINT-4 | delegated | - | core row HINT-4 (implemented, n/a (pure)) · probe `/SESSION_KEY_PREFIX/` binding 0, core 3 · the persistent-layout shape the rule's note describes captures its new URL once HINT-13 is wired — see HINT-13. Without the call it does not: E2E TEST 14, whose `/e2e` layout deliberately has no `syncNavigation()`, measures the layout re-entering `t()` 0 times across a real client-side navigation while the page mounted by it enters 1 time at the new URL |
| HINT-5 | delegated | - | core row HINT-5 (implemented, n/a (pure)) · probe `/HINT_MIN_DELAY_MS\|HINT_MAX_DELAY_MS/` binding 0, core 5 |
| HINT-6 | delegated | - | core row HINT-6 (implemented, n/a (pure)) · probe `/normalizeHintUrl/` binding 0, core 2 |
| HINT-7 | delegated | - | core row HINT-7 (implemented, contract) · probe `/429/` binding 0, core 2 |
| HINT-8 | delegated | - | core row HINT-8 (implemented, n/a (pure)) · probe `/postDiscoveryHint/` binding 0, core 2 |
| HINT-9 | delegated | - | core row HINT-9 (implemented, contract) · probe `/auto_discovery\|autoDiscovery/` binding 0, core 13 |
| HINT-10 | delegated | - | core row HINT-10 (implemented, n/a (pure)) · probe `/passwd\|apikey/` binding 0, core 2 |
| HINT-11 | delegated | - | core row HINT-11 (implemented, n/a (pure)) · probe `/fragmentParamNames\|OAUTH_STATE_MARKERS/` binding 0, core 4 |
| HINT-12 | delegated | - | core row HINT-12 (implemented, n/a (pure)) · probe `/utm_\|gclid\|fbclid/` binding 0, core 3 |
| HINT-13 | implemented | contract | `langsys-js-svelte/kit` exports `syncNavigation()`, which calls the core's `notifyNavigation()` from SvelteKit's `afterNavigate`; `notifyNavigation` is also re-exported by reference for other routers (surface.test.ts `toBe`), and README.md documents both. The rule's own test, `_dev_/contract/verify-contract.mjs`, in real Chromium through SvelteKit's client router against `contract-fixture/`: a read-only, reporting session on `/fixture/a` whose persistent `+layout.svelte` holds a missing phrase navigates to `/fixture/b`, and the double stores a hint for B. Controls, every case: the page's own `window.location` moved to B, page B rendered in the layout's slot, the layout stayed mounted, and a hint for A was stored. Negative control: with the layout phrase registered and only page A's own phrase missing, the navigation unmounts it and nothing is stored for B — while the sibling case shows the double would store B. Mutation: `syncNavigation` not calling `notifyNavigation` reds 1 (no hint for B). The core's half — detached instances record nothing — is core row HINT-13 (implemented, contract) |
| ICU-1 | delegated | - | core row ICU-1 (implemented, n/a (pure)) · probe `/IntlMessageFormat/` binding 0, core 5 |
| ICU-2 | delegated | - | core row ICU-2 (implemented, n/a (pure)) · probe `/\binterpolate\(/` binding 0, core 6 |
| ICU-3 | delegated | - | core row ICU-3 (implemented, n/a (pure)) · probe `/_recoverMissingArgs/` binding 0, core 6 |
| ICU-4 | delegated | - | core row ICU-4 (implemented, n/a (pure)) · probe `/noteDefaultedArgs/` binding 0, core 2 |
| ICU-5 | delegated | - | core row ICU-5 (implemented, n/a (pure)) · probe `/isICU/` binding 0, core 9 |
| ICU-6 | delegated | - | core row ICU-6 (implemented, n/a (pure)) · probe `/noteFormatterFailure/` binding 0, core 2 |
| CID-1 | delegated | - | core row CID-1 (implemented, n/a (pure)) · probe `/canonicalContentBlockJson/` binding 0, core 4 |
| CID-2 | delegated | - | core row CID-2 (implemented, n/a (pure)) · probe `/generateCustomId/` binding 0, core 13 · the testbed imports it to re-derive MARK-1; `src/routes` is not the binding and does not ship |
| CID-3 | delegated | - | core row CID-3 (implemented, n/a (pure)) · probe `/generateLegacyCustomId/` binding 0, core 5 · "JS and its bindings: call the exported functions; do not reimplement them" — nothing here hashes |
| CID-4 | delegated | - | core row CID-4 (implemented, n/a (pure)) · probe `/legacyTokenizeElement/` binding 0, core 4 |
| TOK-1 | delegated | - | core row TOK-1 (implemented, n/a (pure)) · probe `/noscript/` binding 0, core 1 · `<Translate>` hands its host to the core `Translate` class, which does the walking |
| TOK-2 | delegated | - | core row TOK-2 (implemented, n/a (pure)) · probe `/normalizeTokenText/` binding 0, core 21 |
| TOK-3 | delegated | - | core row TOK-3 (implemented, n/a (pure)) · probe `/aria-roledescription/` binding 0, core 1 |
| TOK-4 | delegated | - | core row TOK-4 (implemented, n/a (pure)) · probe `/translateAttribute/` binding 0, core 8 |
| TOK-5 | delegated | - | core row TOK-5 (implemented, n/a (pure)) · probe `/normalizeMarkupPlaceholders\|adoptPercentPlaceholders/` binding 0, core 24 · `%name%` is this binding's explicit markup form, since in Svelte markup `{name}` is an expression: E2E TEST 12 renders it through `<Translate>` and `<Phrase>`; with the transform, `{name}` is a variable, and the fixture's `brace-name-in-markup` row built that way lands on the same id (canonicalization.test.ts) |
| TOK-6 | delegated | - | core row TOK-6 (implemented, n/a (pure)) · probe `/usesSingleTextNodeFastPath/` binding 0, core 7 |
| MARK-1 | implemented | n/a (pure) | Tree path: the served host carries `data-ls-contentblock` equal to the id derived independently from the phrase's tokens (`generateCustomId('VAR', ['Hello {name}, welcome back'])`, var-served.test.ts), and 37 rows of the shared canonicalization fixture built through the transform derive the ids a DOM reader derives (canonicalization.test.ts). Fallback path: an app-supplied `custom_id` is stamped on the served host under the core's attribute (served-bytes.test.ts). Browser: `<Phrase>` carries the core's own `PHRASE_MARKER_ATTR` (E2E TEST 13, bogus-marker control; served bytes); a vanilla `<Translate>` host's stamp equals the id the core tokenizer re-derives (E2E TEST 15, GATE-10 contract case). Mutations: the tree host without its `hostAttrs` reds 1 (var-served.test.ts) and 1 VAR (the stamp); removing the fallback `custom_id` stamp reds 1; removing `<Phrase>`'s marker reds 1 |
| MARK-2 | delegated | - | core row MARK-2 (implemented, n/a (pure)) · probe `/PHRASE_MARKER_ATTR_LEGACY\|isPhraseMarked/` binding 0, core 13 · this binding writes one spelling and reads none |
| MARK-3 | delegated | - | core row MARK-3 (implemented, n/a (pure)) · probe `/isContentBlockMarked/` binding 0, core 4 |
| MARK-4 | delegated | - | core row MARK-4 (implemented, n/a (pure)) · probe `/_walkForTokens/` binding 0, core 5 |
| VAR-1 | implemented | contract | `_dev_/e2e/var.mjs` through SvelteKit against `contract-fixture/`: two users, Ana and Luis, on the transformed route register the one phrase `Hello {name}, welcome back`, and no registered text carries either name; a server render alone registers it after the response. Each render passes its own value: var-served.test.ts serves `Ciao Ana, bentornato` and `Ciao Luis, bentornato` from one catalog entry. Mutation: the value emitted as text instead of the marker pair reds 12 unit and 9 VAR (per-user tokens, no catalog hit, no placeholder phrase, nothing served translated) |
| VAR-2 | implemented | n/a (pure) | Names are the core's `derivePlaceholderNames` (core row VAR-2 (implemented, n/a (pure))); this binding maps Svelte's AST onto the vectors' shape. naming.test.ts runs all 27 rows of `vectors/var-naming-vectors.json` (blob `a4b61ed2`), each asserting the shape Svelte's parser yields for the row's source and the names the row expects; plus a store read, optional chaining, a TypeScript assertion and a nested call. `%name%` and literal `params` keys are handed to the core as taken names. Through SvelteKit, `{items.length}` registers as `You have {items_count} items` (var.mjs). Mutation: the source text used as the name reds 40 unit (every vector row) and 9 VAR |
| VAR-3 | implemented | n/a (pure) | Emitting: the transform writes the tree form, `{comment: 'ls:NAME'}`, the value, `{comment: '/ls'}`, with the typed value also in `params` so the caller's value wins (preprocess.test.ts). Reading: core row VAR-3 (implemented, n/a (pure)). The emitted trees agree with a DOM reader on the shared fixture (`vectors/canonicalization-reference.json`, blob `fa32452d`, canonicalization.test.ts): the four value-marker rows written as Svelte variables — one marker, two markers, marker-only, a marker alone in a slot — reach each row's tokens and id, as do the 32 unmarked rows the build can express; the attribute form, voided pairs and bad names are reader-only rows this build never emits |
| VAR-4 | partial | n/a (pure) | This binding emits (VAR-6); its reader is the core's, core row VAR-3 (implemented, n/a (pure)) at `bb0198c4`, and core row VAR-4 (implemented, n/a (pure)). That core is not released, and `dependencies.langsys-js-typescript` is still `^0.6.4`: the release of this binding must require the core release carrying the reader (Release-wave items) |
| VAR-5 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row VAR-5 (n/a (profile: server)) |
| VAR-6 | implemented | contract | `langsys-js-svelte/preprocess`, one line in `svelte.config.js` (README.md); `_dev_/preprocess-entry.mjs` imports the published entry from the packaged `dist/` and transforms and compiles a component, 4/4. The rule's Test through SvelteKit (`_dev_/e2e/var.mjs`): a component interpolating a user's name inside `<Translate>` registers one phrase with the placeholder across two users, and each placeholder is named per the vectors (VAR-2). Rewrites `<Translate>` and `<Phrase>` content and `` $t(`…`) `` template literals; `{#if}`/`{#key}` branches, handlers, attributes and nested `<Phrase>`/`<Translate>`/`<DontTranslate>` are read, anything else is a named fallback (preprocess.test.ts, 14). Optional: without it the package works unchanged apart from VAR-7 |
| VAR-7 | implemented | contract | `_dev_/e2e/var.mjs`: `/fixture/var-plain`, the same block without the transform, visited by two users, registers neither name, beside the transformed route registering in the same run through the same double; on the transformed route an `{#each}` block mounted at first paint (a fallback) registers nothing. The notice fires and names the transform (debug). A catalogued translation still renders on the plain route. On the server a block without a tree never calls `registerBlock`. Raw HTML is content: a block whose only dynamic part is `{@html}` registers its HTML's text (`From the CMS, section one`), and one that also interpolates a variable registers nothing (var.mjs; preprocess.test.ts). This binding sees raw HTML through the transform, which is where the rule places the carve-out for Svelte; without it the runtime cannot tell an `{@html}` block from an interpolating one, and the block stays under the rule's first clause — var.mjs records it registering nothing, as a measurement. Mutations: the vanilla path always registering reds 4 VAR (a per-user phrase, the `{#each}` fallback, the mixed `{@html}` block, the plain route); removing the notice reds 1 VAR; the `{@html}`-only block not registering reds 1 VAR |
| SSR-1 | delegated | - | core row SSR-1 (implemented, n/a (pure)) · probe `/shouldQueueForWrite/` binding 0, core 2 · both READMEs state that `'client'` collects nothing server-side |
| SSR-2 | delegated | - | core row SSR-2 (implemented, n/a (pure)) · probe `/ssrWriteEnabled/` binding 0, core 3 · corroborated through the binding by the two-case `/e2e/ssr-write` procedure (a valid grant degrades `'server'` and registers 0; no grant registers 2), run per case on a fresh server and not among this revision\'s runs |
| SSR-3 | implemented | n/a (pure) | src/docs.test.ts: README.md and README-SSR.md, both shipped, each carry an `[!IMPORTANT]` callout that leads with the allow-list precondition. Controls: the parser finds README-SSR's known `[!WARNING]` and rejects README.md's plain discovery-gap blockquote, which mentions the allow-list in passing. Demoting the callout to a blockquote reds 1. The refused side belongs to the core and the backend |
| SRV-1 | implemented | contract | Served bytes, through `createLangsysHandle` and the catalog the core fetches from `contract-fixture/` (`_dev_/e2e/var.mjs`): a transformed `<Translate>` serves `Ciao Ana, bentornato` for `it-it`, and the ICU plural the catalog holds for 1 and for 5; no source text is left in the page. In process (var-served.test.ts): for Ana and for Luis; an `{#if}` branch as the branch that renders; control, an empty catalog serves the source with the value in place. `$t()` serves the request locale inside the scope (0 of 800 wrong under concurrency with an await before the read, `_dev_/e2e/srv-scope.mjs`) and the base language for a miss (served-bytes.test.ts). The sanctioned fallback: a block the transform cannot read, or any block without it, is served as source with an app-supplied `custom_id` stamped and no resolved marker (served-bytes.test.ts, the `fallback:` rows; srv-capture.test.ts for `{#await}`), and the core's `warnUnrenderedBlock` fires once per process per reason, on the server only, at debug level — `variable` for a block that registers nothing, `raw-html` for raw-HTML content the client registers (unrendered-notice.test.ts: 50 renders, one notice after a real `init({ debug: true })`; control, a window present, none). Mutations: the tree host rendered without `hostAttrs` reds 1 unit and 1 VAR; removing the server `warnUnrenderedBlock` call reds 1; dropping its server-only guard reds 2 |
| SRV-2 | implemented | n/a (pure) | Each request renders in its own scope (SRV-7), and every store this binding exports reads it: with the process seeded German and the render inside an Italian scope, `$t` / `$currentlyLoadedLocale` / `$sTranslations.SRVC.Pricing` serve `Prezzi` / `it-it` / `Prezzi`; control, no scope, `Preise` / `de-de` / `Preise` (src/ssr-measure/scope-stores.test.ts). Under concurrency, 100 × 8 `it-it`/`de-de` renders awaiting before the read serve 0 of 800 wrong through `createLangsysHandle`, against 400 of 800 with no scope or with one scope shared by every request (`_dev_/e2e/srv-scope.mjs`). No process-global holds per-request state: every server render releases its store subscriptions, in a scope or not — 50 renders each, `tSignal` 100 opened / 100 released, `currentlyLoadedLocale` and `sTranslations` 50 / 50; control, a never-released subscription reads 50 open |
| SRV-3 | implemented | contract | `createLangsysHandle` closes each scope after the response, and the core's close sends the scope's misses only when the key may write. `_dev_/e2e/srv-flush.mjs` against `contract-fixture/`, whose POST /translatable-items is seeded to answer 3 s late, through the shipped helper with the SDK initialised on the server (`ssrTokenStrategy: 'server'`): a page rendering a missing phrase arrives in about 50 ms, the phrase is absent from the double's state when it arrives, and — write key — present once the flush lands. Read-only key: the phrase never arrives, with the write run as the control that the double accepts it. Mutation: the handle awaiting the close before returning makes the page take 3 s and the phrase already registered on arrival — 2 red |
| SRV-4 | implemented | n/a (pure) | The core's half is `seedCatalog`, synchronous (core row SRV-4 (implemented, n/a (pure))). The binding's half ships: `createLangsysHandle` writes the scope's seed into the page and `hydrateFromServer()` hands it to `seedCatalog` before hydration. `_dev_/e2e/srv-scope.mjs` in a real browser: the hydrated page keeps the served Italian with no hydration warning; control, the same page without the seed (`?noseed=1`), re-renders to `Pricing`. Mutation: `hydrateFromServer` not seeding — 1 red |
| SRV-5 | implemented | n/a (pure) | Inside the core's request scope, a depth-3 nested `<Translate>` built by the transform records each block exactly once per render — counts `[1, 1, 1]`, calls counted rather than a set — and what the flush sends names each miss once (srv-capture.test.ts). A placeholder never keys a block: the build tells a placeholder from content — `{#await}` is visible to it — and declines to capture it (preprocess.test.ts), so that block takes SRV-1's fallback: served as `Loading…`, no resolved marker, nothing thrown, and nothing registered from it (VAR-7). Through SvelteKit (`_dev_/e2e/var.mjs`), an `{#await}` resolving in 100 ms and in 2000 ms — either side of the core's 500 ms settle window — renders its content and registers neither the placeholder nor the content. Mutation: rendering each block twice per render reds 1 (the per-block count); no server `registerBlock` reds 1 (what the flush sends) and 1 VAR (SRV-3) |
| SRV-6 | n/a (architecture: the binding resolves no locale — the app's `load` chooses it; live if the binding ever ships a resolver) | - | The rule binds an SDK or binding that chooses the request's locale. This binding never does: `createLangsysHandle` takes the locale from the app's `locale` function, and README-SSR's example `load` chooses it, and it follows the rule: URL, then the app's cookie or session value, then `Accept-Language`, each checked against the project's locales, with `Vary: Cookie` or `Vary: Accept-Language` set to match. The example is documentation, not a test, which is why this row is `n/a` rather than `implemented` |
| SRV-7 | implemented | n/a (pure) | The seam is the core's (core row SRV-7 (implemented, contract)); this binding ships the SvelteKit wiring. `langsys-js-svelte/kit/server` exports `createLangsysHandle({ locale, catalog?, match?, seed?, storage? })`: SvelteKit's `handle` opens `createRequestScope` per request — an AsyncLocalStorage passed once through `setRequestScopeStorage`, so `load`'s awaits stay inside — renders `resolve()` in `scope.run`, writes `scope.seed()` into the page and closes the scope after the response; `langsys-js-svelte/kit` exports `hydrateFromServer()` for `hooks.client.ts`. README-SSR documents both. The rule's Test through the shipped helper, `_dev_/e2e/srv-scope.mjs` on served bytes: (1) one process, `de-de` then `it-it` through a new scope — Italian, no German in the bytes; (2) 100 × 8 concurrent `it-it`/`de-de` renders that await in `load` before the read — 0 of 800 wrong. The rule's mutation, one scope for every request (`SRV_SEAM=shared`), fails (1) and (2), 400 of 800; no scope fails (2), 400 of 800. Mutation of the shipped helper, rendering outside `scope.run`: 3 red, (2) at every response wrong |
| MSG-1 | delegated | - | core row MSG-1 (implemented, n/a (pure)) · probe `/function dig\|function toItems/` binding 0, core 2 · `resolveServerMessages` is the core's, re-exported by reference (surface.test.ts `toBe`); it reads entries only at the configured `key` or through an app `resolver`, and throws with neither. This binding never resolves on its own: the Inertia page (src/msg-measure/InertiaErrors.svelte) takes its key as configuration, and README.md shows `{ key }` in every example, with no default body search |
| MSG-2 | delegated | - | core row MSG-2 (implemented, n/a (pure)) · probe `/function toServerMessage/` binding 0, core 1 · `code` and `field` reach the page as the framework sent them: nothing in this binding reads, maps or renders `code` (render row `code-does-not-choose-text` runs through `$serverMessage`), and the binding exports no code vocabulary |
| MSG-3 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-3 (n/a (profile: server)) |
| MSG-4 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-4 (n/a (profile: server)) |
| MSG-5 | implemented | n/a (pure) | The decision — the template's translation, filled from `params`, when the catalog holds it; `message` otherwise; `message` never a key — is the core's `renderServerMessage` (core row MSG-5 (implemented, n/a (pure))), re-exported by reference (surface.test.ts `toBe`). The binding adds `serverMessage`, a store derived from `t` whose value calls that function, so `{$serverMessage(entry)}` re-renders on a catalog or locale change as `$t` does. src/msg-measure/messages.test.ts runs all 12 `render` rows of `vectors/server-message-vectors.json` (vendored byte-exact, blob `7333e391`) through `$serverMessage`, including `message-is-never-the-key`, and a reactivity row. Mutations: the store derived from nothing reds 1 (reactivity); dropping the category argument reds 1 (`other-category-misses`) |
| MSG-6 | delegated | - | core row MSG-6 (implemented, n/a (pure)) · probe `/DEFAULT_SERVER_MESSAGE_CATEGORY = /` binding 0, core 1 |
| MSG-7 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-7 (n/a (profile: server)) |
| MSG-8 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-8 (n/a (profile: server)) |
| MSG-9 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-9 (n/a (profile: server)) |
| MSG-10 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-10 (n/a (profile: server)) |
| MSG-11 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-11 (n/a (profile: server)) |
| MSG-12 | implemented | n/a (pure) | The binding half: a page given the entries as a prop renders them through the client helper. src/msg-measure/InertiaErrors.svelte resolves them from its props with the core's `resolveServerMessages(props, { key })` and renders each through `$serverMessage`; messages.test.ts renders it on the server with no translation (each entry's `message`), with translated templates (the translations, filled from `params`); the framework's own `errors` prop beside the entries is not read as entries, and resolution with neither a key nor a resolver throws rather than searching the body. README.md documents the Inertia hand-off. Keeping the entries in the session across the redirect is the server adapter's half (langsys-php-laravel); the core rows MSG-12 n/a (profile: server, binding) |
| MIG-1 | delegated | - | core row MIG-1 (implemented, n/a (pure)) · probe `/legacyKeys/` binding 0, core 6 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-2 | delegated | - | core row MIG-2 (implemented, n/a (pure)) · probe `/convertLegacyCall/` binding 0, core 3 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-3 | delegated | - | core row MIG-3 (implemented, n/a (pure)) · probe `/valueAt/` binding 0, core 5 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-4 | delegated | - | core row MIG-4 (implemented, n/a (pure)) · probe `/convertLegacyPluralForms\|PLURAL_CATEGORIES/` binding 0, core 13 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-5 | delegated | - | core row MIG-5 (implemented, n/a (pure)) · probe `/looksLikeAPath/` binding 0, core 2 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-6 | delegated | - | core row MIG-6 (implemented, n/a (pure)) · probe `/warnedLegacy/` binding 0, core 4 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-7 | delegated | - | core row MIG-7 (implemented, n/a (pure)) · probe `/FOREIGN_EXTENSIONS\|SUPPORTED_LEGACY_FORMATS/` binding 0, core 10 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-8 | delegated | - | core row MIG-8 (implemented, n/a (pure)) · probe `/convertLegacyValue/` binding 0, core 6 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-9 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MIG-9 (n/a (profile: server)) |
| FRM-1 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row FRM-1 (n/a (profile: server)) |
| FRM-2 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row FRM-2 (n/a (profile: server)) |
| FRM-3 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row FRM-3 (n/a (profile: server)) |
| FRM-4 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row FRM-4 (n/a (profile: server)) |
| FRM-5 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row FRM-5 (n/a (profile: server)) |
| FRM-6 | delegated | - | core row FRM-6 (implemented, n/a (pure)) · probe `/Accept-Language/` binding 0, core 3 · `LangsysApp.localeHeaders()` is the core's method, forwarded by the proxy without being listed, and `localeHeaders` is the core's export; this binding builds no header |
| FRM-7 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row FRM-7 (n/a (profile: server)) |
| FRM-8 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row FRM-8 (n/a (profile: server)) |
| SNAP-1 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row SNAP-1 (n/a (profile: server)) |
| SNAP-2 | delegated | - | core row SNAP-2 (implemented, n/a (pure)) · probe `/parseSnapshot/` binding 0, core 5 · the snapshot enters through `LangsysApp.loadSnapshot`, which the proxy forwards to the core unchanged; this binding does not parse, verify or override it. src/lib/snapshot-passthrough.test.ts: the core receives the very snapshot object and locale the app passed, and `loadSnapshot` is a bound forward, not an override (control); run through the binding, every `loads` row of `vectors/snapshot-vectors.json` (vendored byte-exact, blob `594bd77a`) renders through `$t` on the next line, and every `refusals` row reaches the app as the core's `SnapshotError` with the row's reason. Mutation: a binding override that clones the file before handing it on reds 2. The core offers no snapshot `init` option at this SHA, so `loadSnapshot` is the only entry |
| SNAP-3 | delegated | - | core row SNAP-3 (implemented, n/a (pure)) · probe `/markSeeded/` binding 0, core 2 · the snapshot enters through `LangsysApp.loadSnapshot`, which the proxy forwards to the core unchanged; this binding does not parse, verify or override it. src/lib/snapshot-passthrough.test.ts: the core receives the very snapshot object and locale the app passed, and `loadSnapshot` is a bound forward, not an override (control); run through the binding, every `loads` row of `vectors/snapshot-vectors.json` (vendored byte-exact, blob `594bd77a`) renders through `$t` on the next line, and every `refusals` row reaches the app as the core's `SnapshotError` with the row's reason. Mutation: a binding override that clones the file before handing it on reds 2. The core offers no snapshot `init` option at this SHA, so `loadSnapshot` is the only entry |
| BIND-1 | implemented | n/a (pure) | Adaptation is confined to Svelte's model: `Writable` → `Signal` (adapters.ts), a store form of `writeGrant` resolved per call, the hydration timing guard (stores.ts), a `serverMessage` store derived from `t`, and `syncNavigation()`, which only times the core's entry point. stores.test.ts; live, E2E TEST 1: the safe store reads `undefined` while the raw signal is `true` at hydration, console clean. Disabling the deferral reds 3 |
| BIND-2 | implemented | n/a (pure) | Artifact inspection with a control: own-rule probe `/write_enabled\|key_type\|auto_discovery\|autoDiscovery/` binding 0, core 43 (`_dev_/delegation-probe.mjs`, comments stripped, tests excluded). `writeEnabled` is surfaced as a tri-state and nothing in `src/lib` reads it to decide anything |
| BIND-3 | implemented | n/a (pure) | Own-rule probe `/fetch\(\|XMLHttpRequest\|sendBeacon\|setInterval\|keepalive\|headers/` binding 0, core 15. One timer exists, `setTimeout(…, 0)` in stores.ts, the hydration handover; it schedules no request. `syncNavigation()` sends nothing |
| BIND-4 | implemented | n/a (pure) | src/lib/config-surface.test.ts: the Svelte config's keys equal the core config's in both directions — `messagesCategory` included — as a type enforced by `npm run check`; control: the same machinery detects an invented key. The binding changes two keys' types (`UserLocaleStore` takes a `Writable`, `writeGrant` also takes a store) and adds none. Adding `discovery?: boolean` gives 1 svelte-check error |
| BIND-5 | implemented | n/a (pure) | `t` is the core's signal (surface.test.ts, `toBe`), and `LangsysApp.t` is the core's current `TFunction`: accessor values pass through the proxy unbound (removing that reds 3). `serverMessage` derives a function from `t` and keeps nothing. Own-rule probe `/memo\|[Cc]ache\|new Map\(\|new WeakMap\(/` binding 0, core 11 |
| BIND-6 | implemented | n/a (pure) | BIND-6 v2. (1) Proxy-forward over the core singleton with an `Object.hasOwn` override set of exactly `init` and `setWriteGrant`, set-equal to `OVERRIDDEN_MEMBERS`; `t`, `currentlyLoadedLocale`, `sTranslations`, `LangsysAppAPI`, `canonicalizeLocale`, `notifyNavigation`, `resolveServerMessages` and `renderServerMessage` by reference (`toBe`). SvelteKit wiring lives in entries of its own so the main one never imports `$app/*` or a Node built-in: `./kit` (`syncNavigation`, `hydrateFromServer`) and `./kit/server` (`createLangsysHandle`), each only times or places a core operation. Two deliberate additions, each a Svelte idiom over a core value: `writeEnabled` (hydration-safe) and `serverMessage` (reactive). `syncNavigation` lives in `./kit` so the main entry never imports `$app/*`. Reachability is generated from the core prototype, not listed. (2) The exported type is `Omit<typeof core, …> & {…}`, so core-private members are absent; surface.test.ts core-PRIVATE rows plus `enumerate-core-surface.mjs --self-test`. (3) No test or doc presents a core-private name as API. (4) `this` is the core: functions are bound to the target with the target as receiver — proxy-receiver.test.ts, where a naive proxy fails first on a `#private` fixture. (5) Destructuring works (surface.test.ts). Accessor values are never bound, so `t` keeps its identity; removing that reds 3 |
| GRANT-1 | implemented | n/a (pure) | `writeGrant` takes a string, a provider (sync or async), or — Svelte only — a store, which `adaptWriteGrant` turns into a provider (adapters.test.ts). README.md leads with the store and tells integrators to prefer a store or provider over a string, which goes stale when the token expires. Mutation: passing the store through unadapted reds 4 |
| GRANT-2 | implemented | n/a (pure) | The store is read on every provider call, never at adapt time (adapters.test.ts). Live corroboration, E2E TEST 8: writing an expired token into the store degrades the next request, `true → false`, with no imperative call. Mutation: snapshotting the store at adapt time reds 3 |
| GRANT-3 | implemented | live | E2E TEST 16: READ key with no grant paints `false`; the binding's `setWriteGrant(valid)` paints `true`, and that value is the re-authorization response's `write_enabled`, not local state. TEST 3: the call issues an authorize-project request carrying `X-Write-Grant`. Mutation: an override that resolves without calling the core reds 5 (TEST 3 ×2, TEST 16 ×3) |
| GRANT-4 | implemented | live | E2E TEST 8: a valid store-form grant flips a READ key — the grant arm, not the key type — and `X-Write-Grant` survives the cross-origin preflight. TEST 9: self-minted valid accepted, expired and no-`exp` refused. TEST 16: misses rendered after the grant land in the catalog. The delayed short-TTL case is not run as a delay; the server receives it exactly as TEST 9's already-expired token. Mutation: `init` dropping `writeGrant` reds 3 (TEST 8 ×3) |
| CACHE-1 | delegated | - | core row CACHE-1 (implemented, n/a (pure)) · probe `/langsys:translations/` binding 0, core 2 |
| CACHE-2 | delegated | - | core row CACHE-2 (implemented, contract) · probe `/catalogUnavailable/` binding 0, core 12 |
| OBS-1 | delegated | - | core row OBS-1 (implemented, contract) · probe `/noticeUnusableWriteCapability/` binding 0, core 4 |
| WIRE-1 | delegated | - | core row WIRE-1 (implemented, n/a (pure)) · probe `/x-Authorization\|X-Authorization/` binding 0, core 1 |
| WIRE-2 | delegated | - | core row WIRE-2 (implemented, contract) · probe `/204/` binding 0, core 1 |
| WIRE-3 | delegated | - | core row WIRE-3 (implemented, contract) · probe `/toLowerCase\|getCanonicalLocales/` binding 0, core 39 · locale.test.ts pins the re-exported `canonicalizeLocale` producing lowercase |
| WIRE-4 | delegated | - | core row WIRE-4 (implemented, contract) · probe `/\bsettle\(/` binding 0, core 5 · README-SSR tells SSR users to seed `{}`, never `null`, because a nullish catalog makes the core's `t()` throw |
| WIRE-5 | implemented | live | Redirect: the testbed points the SDK at `http://langsys2.test/api` with `init({ apiUrl })` through this binding's `init` override (harness.ts, grant route) — E2E TEST 7 sees requests arrive at that host, TEST 11 and TEST 16 read server state back from it. Findability: README.md "Pointing the SDK at another API" (src/docs.test.ts; mutation removing the section reds 1). The late-`setBaseUrl` ordering failure is the core's (core row WIRE-5) and is warned against in the same section |
| CONF-1 | implemented | contract | Rows graded on a property the API decides rest on server state, never on requests. Contract: HINT-13 and GATE-10 read `contract-fixture`'s accepted state (stored hints, registered phrases and blocks). Live: GRANT-3/4 on the authorization response body and catalog contents (E2E TEST 16), registration on 2xx plus presence in the catalog (TEST 11), no 4xx/5xx across the suite. Outgoing-request observations — TEST 3's header, TEST 10's report URLs — grade nothing on their own. Every path: MARK-1 and GATE-10 are proven per reader (`<Phrase>` and `<Translate>`), and the server path is measured separately (SRV-1) |
| CONF-2 | implemented | n/a (pure) | This file. `node _dev_/conformance-summary.mjs --check` reads the rule list out of the blob the header cites and fails on a missing, duplicate, family or unknown row, a non-canonical status or tier, `implemented` below live, contract or pure, and `delegated` with a tier; `--self-test` shows each check firing. The contract tier is `contract-fixture/`, vendored byte-exact and cited by tree `d7f89b89f911a90a06fc511ac72f8e0e913d4af3`. Absences: HINT-13's no-hint-for-B and GATE-10's suppressions are each evidence because a sibling case in the same run shows the double accepting that action for the same key — a stored hint for B, a registered unmarked block — and neither rule is about a capability the SDK learned, so no drift applies. Capability-drift rows are delegated to the core, which drifts them (core rows GATE-1, HINT-9). No row is provisional |
| CONF-3 | implemented | n/a (pure) | Each mutation is recorded, re-appliable, and tabled under Mutations with what it reds. Contract and unit mutations run in an isolated copy of the tree on its own dev server — never in `src/` — and that copy passes 22 of 22 unmutated first, so a red is the mutation's. SSR strategy cases and the concurrency measurement each run on a freshly started server |

## Reading a row

**Tier** records the evidence for the property the rule governs, not whether a double appears in
a test. `contract` is `contract-fixture/`'s accepted state, read back after a real browser drove
the binding against it. `live` is the local langsys2 stack, through a committed harness that
re-runs on demand. `n/a (pure)` covers in-process and DOM behaviour, inspection of a shipped
artifact with a positive control, and meta-rules. A `delegated` row takes `-`.

**`delegated`** means the core owns the rule and this binding takes no part. Each row names the
core row and its grade at the core SHA above, and one probe pattern for that rule alone.
`node _dev_/delegation-probe.mjs --check` counts each pattern with comments stripped on both
sides and tests excluded, and fails unless the binding count is 0 **and** the core count is above
0 — the core count is the control proving the search could have found something. It also fails
if a delegated row has no probe or a probe has no delegated row. Where the binding re-exports a
core function by reference (the server-message helpers), the probe names what the function does
inside, which the binding never does.

**Own-rule probes.** BIND-2, BIND-3 and BIND-5 are this binding's own rules, and their absence
halves use the same instrument and the same control.

## Evidence — and re-running it

**Unit** — `npm test -- --run`. No network. Includes the served-bytes measurement
(`src/ssr-measure`), the server-message vectors and Inertia page (`src/msg-measure`) and the
docs checks (`src/docs.test.ts`). `npm run check` carries BIND-4's type.

**Contract** — the double is started by the harness itself:

```bash
npm run dev                                       # 127.0.0.1:5173, freshly started
node _dev_/contract/verify-contract.mjs           # 22/22, about 50 s
```

**E2E, live** — against the local langsys2 stack:

```bash
# once: npx playwright install chromium; a .env per .env.example (gitignored);
#       the local project seeded with langsys2's SdkIntegrationSeeder; the core linked
npm run dev                                       # 127.0.0.1:5173, freshly started
node --env-file=.env _dev_/e2e/verify.mjs         # 61/61, about 110–160 s

# SRV concurrency — its own freshly started server; no API, no .env
node _dev_/e2e/srv-concurrency.mjs                # body seed 0/800 wrong-locale; control 390/800

# SRV-7 — the dev server started with the seam to test; red until the core ships its scope
SRV_SEAM=core npm run dev                         # or global (no scope) / shared (the mutation)
node _dev_/e2e/srv-scope.mjs                      # 9/9 on SRV_SEAM=core

# What Svelte does to text it holds: reactivity inside translated blocks, and hydration facts
node _dev_/e2e/svelte-dom.mjs                     # 17/17 on core 01bf4bda; 15/17 on c635a94f

# VAR — the double, then a dev server with the SDK initialised against it
node _dev_/e2e/var.mjs --serve
SRV_API=http://127.0.0.1:8787/api SRV_KEY=k-write npm run dev && node _dev_/e2e/var.mjs   # 21/21

# The published preprocessor entry
npm run package && node _dev_/preprocess-entry.mjs                                      # 4/4

# SRV-3 — the double with a 3 s flush, then one dev server per key
node _dev_/e2e/srv-flush.mjs --serve
SRV_API=http://127.0.0.1:8787/api SRV_KEY=k-write npm run dev && node _dev_/e2e/srv-flush.mjs --expect write
SRV_API=http://127.0.0.1:8787/api SRV_KEY=k-read  npm run dev && node _dev_/e2e/srv-flush.mjs --expect read
```

**Conformance tooling**

```bash
node _dev_/conformance-summary.mjs --check      # this file against the cited blob, by rule id
node _dev_/conformance-summary.mjs --self-test
node _dev_/delegation-probe.mjs --check         # delegated rows + own-rule probes, with controls
node _dev_/delegation-probe.mjs --self-test
node _dev_/enumerate-core-surface.mjs --self-test
```

## Mutations

Each performed, observed red, and restored. Unit and contract mutations run in an isolated copy
of the tree — never in `src/` — on its own dev server, after that copy passes unmutated.

| Rule | Mutation | Red |
|---|---|---|
| HINT-13 | `syncNavigation` does not call `notifyNavigation` | 1 contract (no hint stored for B) |
| GATE-10 | `<Translate>` hands the core a detached copy of its host | 4 contract (three resolved shapes register; the stamp is missing) |
| GATE-10 | `<Phrase>` hands the core a detached copy of its host | 1 contract (the resolved `<Phrase>` registers) |
| MSG-5 | `serverMessage` derived from nothing, so it never re-emits | 1 (reactivity row) |
| MSG-5 | the wrapper drops the category argument | 1 (`other-category-misses`) |
| MIG-1..8 | the `init` override copies `legacyKeys` instead of passing it through | 2 (init-passthrough.test.ts) |
| SNAP-2, SNAP-3 | the binding overrides `loadSnapshot` and clones the file before handing it on | 2 (snapshot-passthrough.test.ts) |
| BIND-1 | `if (pastHydration)` → `if (true)` in stores.ts | 3 (stores.test.ts) |
| BIND-4 | add `discovery?: boolean` to the Svelte config | 1 svelte-check error |
| BIND-5, BIND-6 | remove the accessor check from the proxy handler | 3 (1 fixture row, 2 core-generated rows) |
| BIND-6 | hide `init` from `OVERRIDDEN_MEMBERS` / delete the `init` override / hide `getCountries` | 1 / 2 / 1 |
| BIND-6 | forward with the proxy as receiver | proxy-receiver.test.ts fixture rows |
| GRANT-1 | `adaptWriteGrant` passes a store through unadapted | 4 (adapters.test.ts) |
| GRANT-2 | `adaptWriteGrant` snapshots the store at adapt time | 3 (adapters.test.ts) |
| GRANT-3 | the `setWriteGrant` override resolves without calling the core | 5 live (TEST 3 ×2, TEST 16 ×3) |
| GRANT-4 | the `init` override drops `writeGrant` | 3 live (TEST 8 ×3) |
| MARK-1 | remove `{...markerAttr}` from Phrase.svelte | 1 (served-bytes.test.ts) |
| MARK-1 | remove `{...stamp}` from Translate.svelte (an app-supplied `custom_id` on the served host, fallback path) | 1 (served-bytes.test.ts) |
| SRV-1 | remove the server `warnUnrenderedBlock(…)` call from Translate.svelte and Phrase.svelte | 1 (unrendered-notice.test.ts: no notice) |
| SRV-1 | drop the server-only guard on that call | 2 (the client-path control emits a notice) |
| SRV-7, SRV-2 | `createLangsysHandle` renders `resolve()` outside `scope.run` | 3 (srv-scope.mjs: German premise, case 1, case 2 at every response) |
| — (core regression guard) | run `svelte-dom.mjs` against core `c635a94f`, before the core wrote `<Phrase>` and `<option>` text in place | 2 (the `<Phrase>` expression and the two-token `<option>` expression stay on their first translation) |
| SRV-3 | `createLangsysHandle` awaits `scope.close()` before returning | 2 (srv-flush.mjs: the page takes 3 s; the phrase is already registered on arrival) |
| SRV-4 | `hydrateFromServer` does not seed | 1 (srv-scope.mjs: the hydrated page re-renders to `Pricing`) |
| SRV-7 | one core scope shared by every request (`SRV_SEAM=shared`) | 3 (case 1 ×2, case 2 at 400/800) |
| VAR-1, VAR-6 | the transform emits the value as text, no marker pair | 12 unit (canonicalization rows, preprocess, served bytes) · 9 VAR |
| VAR-2 | the source text used as the placeholder name | 40 unit (every naming-vector row) · 9 VAR |
| VAR-7 | the vanilla path always registers | 4 VAR (per-user phrase, `{#each}` fallback, mixed `{@html}`, the plain route) |
| VAR-7 | no `warnUnregistered` call | 1 VAR (the notice) |
| VAR-7 | the `{@html}`-only block registers nothing | 1 VAR (the content registers) |
| MARK-1, SRV-1 | the tree host rendered without `hostAttrs` | 1 unit (var-served.test.ts) · 1 VAR (the stamp) |
| SRV-3 | no `registerBlock` on the server | 1 unit (srv-capture.test.ts, the flush) · 1 VAR (a server render registers) |
| SRV-5 | each block rendered twice per render | 1 unit (srv-capture.test.ts, the per-block count) |
| GATE-10 | `registerBlock` handed a detached copy of the host (tree path) | 4 contract (three resolved `<Translate>` shapes and the resolved `<Phrase>` register) |
| SSR-3 | demote README.md's `[!IMPORTANT]` callout to a plain blockquote | 1 (docs.test.ts) |
| WIRE-5 | rename README.md's "Pointing the SDK at another API" section | 1 (docs.test.ts) |

The VAR, tree-path SRV and MARK-1, GATE-10 tree-path and fallback-notice mutations ran against core `8ecad83b` in an isolated copy that first passed unmutated (unit 268/268, VAR 18/18, contract 22/22). The kit mutations (SRV-3, SRV-4, SRV-7) ran against core `c635a94f`, each in an isolated copy that first passed unmutated; the server-stamp and shared-scope ones against `03685b82`, the SNAP one against `a639ae8c`, the MIG one against `2d57cdd9`, the HINT-13, GATE-10 and MSG-5 ones against
`86871033`; the rest ran against earlier core builds of this branch and touch only binding code
that has not changed since.

## Release-wave items

- **`dependencies.langsys-js-typescript` is `^0.6.4`, and the lockfile resolves registry `0.6.5`**,
  which predates this ticket. The range must match the core version that ships in the same wave.
  Until then a clean clone installs a core without the 838 surface, and CI on this branch cannot
  go green.
- **The VAR reader must be released first (VAR-4).** The range must require the core release
  that carries VAR-3's reader, `register: false` and `warnUnregistered` (at `bb0198c4` here).
- **`langsys-js-svelte/preprocess`** is a new subpath export, a Node module run by the bundler,
  and `magic-string` a new dependency of it.
- **`<Translate>` and `<Phrase>` register nothing without the transform** (VAR-7): the release
  notes say so first.
- **`langsys-js-svelte/kit`** is a new subpath export (`package.json` `exports`), and a published
  surface from the first release that carries it. `@sveltejs/kit` is declared an optional peer for it.
