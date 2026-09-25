# Conformance — langsys-js-svelte

| | |
|---|---|
| **Spec revision read** | langsys2 f5568b88…, docs/sdk-spec.mdx blob b9fd4b5b1c15f7ba29656d550dca1f06013327c0 |
| **Profiles** | browser, binding, all — derived: binding over langsys-js-typescript |
| **specVersion** | 8.2.15, unpublished |
| **Re-derived at this write** | `git -C ../langsys2 ls-tree f5568b88283e7c87e9bb9e87ff348bf848bdadc2 docs/sdk-spec.mdx` → `b9fd4b5b…`. The 113 rule ids are read out of that blob by `node _dev_/conformance-summary.mjs`, not counted from this file. |
| **Binding revision** | `feature/838_write_key_gating_reland`. The commit carrying this file is the one reported to the reviewer; a SHA written here could only name its parent. |
| **Core under test** | `langsys-js-typescript` `a639ae8cc4976cd6cf1525236576abf7cc304054`, built clean from a detached worktree of that SHA and linked in place of the shared checkout, which carries uncommitted work. `node _dev_/delegation-probe.mjs` prints the checkout it resolves. Every `core row` citation below is read from that SHA's CONFORMANCE.md. |
| **Contract fixture** | `contract-fixture/`, vendored byte-exact from langsys-js-typescript, tree `542f57f5ffcb9038db1b7411152b7e31b96cb269` (`git rev-parse HEAD:contract-fixture`). Node 18+, no dependencies. |
| **Shared vectors** | Vendored byte-exact under `vectors/`: `server-message-vectors.json`, blob `c8125549cfee0f5286f79a8cbc194cd30ccd446e`; `snapshot-vectors.json`, blob `594bd77a0289abfdf608508ac93cc9f4c4f88459`. |
| **Suites** | unit 160 tests in 12 files (`npm test -- --run`, no network) · contract 22 assertions (`_dev_/contract/verify-contract.mjs`) · E2E 61 assertions, live (`_dev_/e2e/verify.mjs`) · SRV concurrency 6 assertions (`_dev_/e2e/srv-concurrency.mjs`) |

## What surfaced while writing this

1. **The shared core checkout was mid-edit.** At the SHA the reviewer named, its working tree
   carried another lane's uncommitted server-message work, and a build of it is not a build of
   that SHA. Every run here uses a clean build of a detached worktree instead.
2. **The contract fixture sends no CORS headers**, so a browser binding cannot reach it
   directly. The testbed reaches it through a same-origin dev-server proxy (`/__fx`); the double
   still answers every request.
3. **A mutation copy of the tree must be proven sound before its reds count.** The first copy
   failed every case unmutated — Vite refused to serve its symlinked `node_modules` — which
   would have read as three mutations each turning the suite red. The copy now passes 22 of 22
   unmutated before any mutation runs in it.

## Gaps, ranked by cost

1. **SRV-1** — `<Translate>` and `<Phrase>` content reaches crawlers, link previews and no-JS readers
   in the base language under a localised URL. SEO cost lands on the customer, silently.
2. **SRV-2** — no request-scoped catalog. Correct per visitor only because Svelte's default
   renderer is synchronous; `experimental.async` with an await before a read in the same script
   removes that. Intermittent, under traffic.
3. **SRV-4** — no tested hydration hand-off, and the documented seed does not go through the
   core's `seedCatalog`.
4. **SRV-3** — collection is not ordered after the response flush. Latency, `'server'` strategy only.
5. **SRV-5** — follows SRV-1: there is no server-side capture to count.

SRV-1..5 are measured and not built: whether server rendering of components lives in JS Server
adapters or in each binding is an open operator decision. Four delegated rows rest on core rows
that are `partial` — REG-10, TOK-6, MARK-2, MARK-3 — and close when the core's do.

## Status

| Rule | Status | Tier | Evidence |
|---|---|---|---|
| GATE-1 | delegated | - | core row GATE-1 (implemented, contract) · probe `/write_enabled/` binding 0, core 9 · corroborated through the binding, live: E2E TEST 2 read → false, ip_write → true, write → true; TEST 13 painted value equals the authorize-project body |
| GATE-2 | delegated | - | core row GATE-2 (implemented, contract) · probe `/applyWriteEnabled\|canWrite/` binding 0, core 6 · the binding's `writeEnabled` wrapper keeps unknown as `undefined`, never `false` (stores.test.ts) — surfacing, not a lane decision |
| GATE-3 | delegated | - | core row GATE-3 (implemented, n/a (pure)) · probe `/localStorage\|sessionStorage\|setWriteEnabled/` binding 0, core 5 · the one module-level flag here, `pastHydration` (stores.ts), records hydration timing, not the decision. The GATE-3 carve-out is not taken |
| GATE-4 | delegated | - | core row GATE-4 (implemented, n/a (pure)) · probe `/persistScoped\|catalogCache/` binding 0, core 6 |
| GATE-5 | delegated | - | core row GATE-5 (implemented, contract) · probe `/updateTokens/` binding 0, core 7 |
| GATE-6 | delegated | - | core row GATE-6 (implemented, contract) · probe `/recordMissForDiscovery/` binding 0, core 5 |
| GATE-7 | delegated | - | core row GATE-7 (implemented, contract) · probe `/registerContentBlock/` binding 0, core 5 · every detecting path here is the core's: `$t` is the core signal, `<Translate>` and `<Phrase>` construct core handlers. Documented edge: under `'client'`, content rendered only during SSR feeds neither lane — SSR-1's required non-collection, stated in both READMEs |
| GATE-8 | delegated | - | core row GATE-8 (implemented, contract) · probe `/key_type/` binding 0, core 20 · the tri-state is surfaced unchanged; stores.test.ts "never substitutes false for not known yet" |
| GATE-9 | delegated | - | core row GATE-9 (implemented, contract) · probe `/discoveryBaseLocaleOnly/` binding 0, core 8 |
| GATE-10 | implemented | contract | `_dev_/contract/verify-contract.mjs` against `contract-fixture/` (tree `542f57f5`), a writer session in a real browser, asserting the double's accepted state. The core walks up from the host this binding hands it, so each case sits in a different ancestor shape: `data-ls-resolved="it-it"` on the parent, the `data-langsys-resolved` spelling, a bare attribute three ancestors up, and a `<Phrase>` inside a resolved subtree all register nothing; `="false"` on a nearer ancestor opts back out and registers. Controls: an unmarked `<Translate>` and an unmarked `<Phrase>` register, so the double accepted this session's writes; and a bare `$t()` under a resolved ancestor registers, because `t()` is not a DOM reader (GATE-9 governs it). Identity untouched: the resolved block's `data-ls-contentblock` equals the id the core tokenizer re-derives from the host. Mutations: `<Translate>` handing the core a detached copy of its host reds 4; the same for `<Phrase>` reds 1. The reading itself is the core's (core row GATE-10 (implemented, n/a (pure))) |
| CAT-1 | delegated | - | core row CAT-1 (implemented, n/a (pure)) · probe `/buildTFn\|missingToken/` binding 0, core 37 · `t` is the core's signal by identity (surface.test.ts), so no lookup runs here |
| CAT-2 | delegated | - | core row CAT-2 (implemented, n/a (pure)) · probe `/\blookup\(/` binding 0, core 6 |
| CAT-3 | delegated | - | core row CAT-3 (implemented, n/a (pure)) · probe `/isContentBlockKnown/` binding 0, core 5 |
| REG-1 | delegated | - | core row REG-1 (implemented, n/a (pure)) · probe `/canWrite/` binding 0, core 2 |
| REG-2 | delegated | - | core row REG-2 (implemented, n/a (pure)) · probe `/debounceTimer\|scheduleTokenFlush/` binding 0, core 10 |
| REG-3 | delegated | - | core row REG-3 (implemented, n/a (pure)) · probe `/flushOnTeardown/` binding 0, core 4 |
| REG-4 | delegated | - | core row REG-4 (implemented, n/a (pure)) · probe `/keepalive\|sendBeacon/` binding 0, core 7 |
| REG-5 | delegated | - | core row REG-5 (implemented, n/a (pure)) · probe `/installTeardownFlush\|visibilitychange\|pagehide/` binding 0, core 4 |
| REG-6 | delegated | - | core row REG-6 (implemented, n/a (pure)) · probe `/\[\.\.\.this\.missingTokens\]/` binding 0, core 2 |
| REG-7 | delegated | - | core row REG-7 (implemented, n/a (pure)) · probe `/updateInFlight/` binding 0, core 4 |
| REG-8 | delegated | - | core row REG-8 (implemented, contract) · probe `/consecutiveFailures\|retryNotBefore/` binding 0, core 10 |
| REG-9 | delegated | - | core row REG-9 (implemented, contract) · probe `/batch_limit/` binding 0, core 2 |
| REG-10 | delegated | - | core row REG-10 (partial) · probe `/noteSendFailure\|createTranslatableItems/` binding 0, core 6 |
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
| ICU-1 | delegated | - | core row ICU-1 (implemented, n/a (pure)) · probe `/IntlMessageFormat/` binding 0, core 4 |
| ICU-2 | delegated | - | core row ICU-2 (implemented, n/a (pure)) · probe `/\binterpolate\(/` binding 0, core 4 |
| ICU-3 | delegated | - | core row ICU-3 (implemented, n/a (pure)) · probe `/_recoverMissingArgs/` binding 0, core 5 |
| ICU-4 | delegated | - | core row ICU-4 (implemented, n/a (pure)) · probe `/noteDefaultedArgs/` binding 0, core 2 |
| ICU-5 | delegated | - | core row ICU-5 (implemented, n/a (pure)) · probe `/isICU/` binding 0, core 6 |
| ICU-6 | delegated | - | core row ICU-6 (implemented, n/a (pure)) · probe `/noteFormatterFailure/` binding 0, core 2 |
| CID-1 | delegated | - | core row CID-1 (implemented, n/a (pure)) · probe `/canonicalContentBlockJson/` binding 0, core 4 |
| CID-2 | delegated | - | core row CID-2 (implemented, n/a (pure)) · probe `/generateCustomId/` binding 0, core 9 · the testbed imports it to re-derive MARK-1; `src/routes` is not the binding and does not ship |
| CID-3 | delegated | - | core row CID-3 (implemented, n/a (pure)) · probe `/generateLegacyCustomId/` binding 0, core 5 · "JS and its bindings: call the exported functions; do not reimplement them" — nothing here hashes |
| CID-4 | delegated | - | core row CID-4 (implemented, n/a (pure)) · probe `/legacyTokenizeElement/` binding 0, core 4 |
| TOK-1 | delegated | - | core row TOK-1 (implemented, n/a (pure)) · probe `/noscript/` binding 0, core 1 · `<Translate>` hands its host to the core `Translate` class, which does the walking |
| TOK-2 | delegated | - | core row TOK-2 (implemented, n/a (pure)) · probe `/normalizeTokenText/` binding 0, core 17 |
| TOK-3 | delegated | - | core row TOK-3 (implemented, n/a (pure)) · probe `/aria-roledescription/` binding 0, core 1 |
| TOK-4 | delegated | - | core row TOK-4 (implemented, n/a (pure)) · probe `/translateAttribute/` binding 0, core 6 |
| TOK-5 | delegated | - | core row TOK-5 (implemented, n/a (pure)) · probe `/normalizeMarkupPlaceholders\|adoptPercentPlaceholders/` binding 0, core 20 · this binding documents `%name%` as the markup form because Svelte compiles a bare `{name}`; E2E TEST 12 renders it through `<Translate>` and `<Phrase>` |
| TOK-6 | delegated | - | core row TOK-6 (partial) · probe `/usesSingleTextNodeFastPath/` binding 0, core 7 |
| MARK-1 | implemented | n/a (pure) | Per surface. `<Phrase>`: this binding stamps the host with the core's own `PHRASE_MARKER_ATTR` — E2E TEST 13 with a bogus-marker control, and present in served bytes (served-bytes.test.ts); removing the spread reds 1. `<Translate>`: the core stamps this binding's host — E2E TEST 15 and the GATE-10 contract case both re-derive the id by running the core tokenizer over the host; a perturbed token list does not match. Server bytes carry no content-block stamp (SRV-1) |
| MARK-2 | delegated | - | core row MARK-2 (partial) · probe `/PHRASE_MARKER_ATTR_LEGACY\|isPhraseMarked/` binding 0, core 10 · this binding writes one spelling and reads none |
| MARK-3 | delegated | - | core row MARK-3 (partial) · probe `/isContentBlockMarked/` binding 0, core 5 |
| MARK-4 | delegated | - | core row MARK-4 (implemented, n/a (pure)) · probe `/_walkForTokens/` binding 0, core 4 |
| SSR-1 | delegated | - | core row SSR-1 (implemented, n/a (pure)) · probe `/shouldQueueForWrite/` binding 0, core 2 · both READMEs state that `'client'` collects nothing server-side |
| SSR-2 | delegated | - | core row SSR-2 (implemented, n/a (pure)) · probe `/ssrWriteEnabled/` binding 0, core 3 · corroborated through the binding by the two-case `/e2e/ssr-write` procedure (a valid grant degrades `'server'` and registers 0; no grant registers 2), run per case on a fresh server and not among this revision\'s runs |
| SSR-3 | implemented | n/a (pure) | src/docs.test.ts: README.md and README-SSR.md, both shipped, each carry an `[!IMPORTANT]` callout that leads with the allow-list precondition. Controls: the parser finds README-SSR's known `[!WARNING]` and rejects README.md's plain discovery-gap blockquote, which mentions the allow-list in passing. Demoting the callout to a blockquote reds 1. The refused side belongs to the core and the backend |
| SRV-1 | partial | n/a (pure) | src/ssr-measure/served-bytes.test.ts, on served bytes. Under README-SSR's component-body seed, `$t()` serves the request locale, and the base language for a genuine miss in the same render; control: an empty catalog serves base. Concurrency through that seed, `_dev_/e2e/srv-concurrency.mjs` on a freshly started dev server, 100 rounds × 8 renders alternating `it-it`/`de-de`: 0 of 800 wrong-locale; the same harness with the seed before an `await` in `load` (positive control) serves 388 of 800 wrong. Svelte's default server render is one synchronous pass, so the seed's placement decides it. `<Translate>` and `<Phrase>` serve the base language with the translation present, because both construct their handler in `$effect`, which SSR never runs — pinned as GAP rows that go red when that changes |
| SRV-2 | not implemented | - | No request scope exists: the catalog is the core's module-global `sTranslations`, and README-SSR's seed writes it per request, which the MUST forbids by construction. The default renderer keeps it correct per visitor (SRV-1: 0 of 800), and the documented placement is what does it (control: 388 of 800). The `experimental.async` shape — an await, then a read in the same script — is unmeasured here: it needs a compiler flag that would change the renderer for every testbed route |
| SRV-3 | not implemented | - | Nothing orders collection after the response flush. Under the default `'client'` the server collects nothing; under `'server'` the core's debounced flush runs in Node with no tie to SvelteKit's response lifecycle. No test asserts the order of events |
| SRV-4 | not implemented | - | The rule splits. Core half: `seedCatalog` is synchronous (core row SRV-4 (implemented, n/a (pure))) and reachable through the proxy with no override (surface.test.ts). Binding half — calling it before hydration so the first client render matches the served HTML, with the mismatch control — has no test, and README-SSR's seed writes the two signals directly rather than calling `seedCatalog` |
| SRV-5 | not implemented | - | No server-side child capture exists: `<Translate>` and `<Phrase>` do nothing during SSR (served-bytes.test.ts GAP rows), so there is no per-subtree count to assert and no uncapturable child to fail on |
| SRV-6 | n/a (architecture: the binding resolves no locale — the app's `load` chooses it; live if the binding ever ships a resolver) | - | The rule binds an SDK or binding that chooses the request's locale. This binding never does; README-SSR's example `load` does, and it follows the rule: URL, then the app's cookie or session value, then `Accept-Language`, each checked against the project's locales, with `Vary: Cookie` or `Vary: Accept-Language` set to match. The example is documentation, not a test, which is why this row is `n/a` rather than `implemented` |
| MSG-1 | delegated | - | core row MSG-1 (implemented, n/a (pure)) · probe `/function dig\|MAX_DEPTH/` binding 0, core 3 |
| MSG-2 | delegated | - | core row MSG-2 (implemented, n/a (pure)) · probe `/SERVER_MESSAGE_CODES = /` binding 0, core 1 |
| MSG-3 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-3 (n/a (profile: server)) |
| MSG-4 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-4 (n/a (profile: server)) |
| MSG-5 | implemented | n/a (pure) | The decision — the template's translation, filled from `params`, when the catalog holds it; `message` otherwise; `message` never a key — is the core's `renderServerMessage` (core row MSG-5 (implemented, n/a (pure))), re-exported by reference (surface.test.ts `toBe`). The binding adds `serverMessage`, a store derived from `t` whose value calls that function, so `{$serverMessage(entry)}` re-renders on a catalog or locale change as `$t` does. src/msg-measure/messages.test.ts runs all 10 `render` rows of `vectors/server-message-vectors.json` (vendored byte-exact, blob `c8125549`) through `$serverMessage`, including `message-is-never-the-key`, and a reactivity row. Mutations: the store derived from nothing reds 1 (reactivity); dropping the category argument reds 1 (`other-category-misses`) |
| MSG-6 | delegated | - | core row MSG-6 (implemented, n/a (pure)) · probe `/DEFAULT_SERVER_MESSAGE_CATEGORY = /` binding 0, core 1 |
| MSG-7 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-7 (n/a (profile: server)) |
| MSG-8 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-8 (n/a (profile: server)) |
| MSG-9 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-9 (n/a (profile: server)) |
| MSG-10 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-10 (n/a (profile: server)) |
| MSG-11 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MSG-11 (n/a (profile: server)) |
| MSG-12 | implemented | n/a (pure) | The binding half: a page given the entries as a prop renders them through the client helper. src/msg-measure/InertiaErrors.svelte resolves them from its props with the core's `resolveServerMessages(props, { key })` and renders each through `$serverMessage`; messages.test.ts renders it on the server with no translation (each entry's `message`), with translated templates (the translations, filled from `params`), and with a prop the page was not told about (nothing). README.md documents the Inertia hand-off. Keeping the entries in the session across the redirect is the server adapter's half (langsys-php-laravel); the core rows MSG-12 n/a (profile: server, binding) |
| MIG-1 | delegated | - | core row MIG-1 (implemented, n/a (pure)) · probe `/legacyKeys/` binding 0, core 6 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-2 | delegated | - | core row MIG-2 (implemented, n/a (pure)) · probe `/convertLegacyCall/` binding 0, core 3 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-3 | delegated | - | core row MIG-3 (implemented, n/a (pure)) · probe `/valueAt/` binding 0, core 5 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-4 | delegated | - | core row MIG-4 (implemented, n/a (pure)) · probe `/convertLegacyPluralForms\|PLURAL_CATEGORIES/` binding 0, core 13 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-5 | delegated | - | core row MIG-5 (implemented, n/a (pure)) · probe `/looksLikeAPath/` binding 0, core 2 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-6 | delegated | - | core row MIG-6 (implemented, n/a (pure)) · probe `/warnedLegacy/` binding 0, core 4 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-7 | delegated | - | core row MIG-7 (implemented, n/a (pure)) · probe `/FOREIGN_EXTENSIONS\|SUPPORTED_LEGACY_FORMATS/` binding 0, core 10 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-8 | delegated | - | core row MIG-8 (implemented, n/a (pure)) · probe `/convertLegacyValue/` binding 0, core 6 · the mode is the core's `legacyKeys` init option, and a legacy key resolves inside the core's own `t()`, which this binding re-exports by reference. src/lib/init-passthrough.test.ts pins that the `init` override hands `legacyKeys` to the core by identity — the same array and file objects — and adds none when it is unset; control: the one adapted key does not arrive by identity. Mutation: the override copying `legacyKeys` reds 2 |
| MIG-9 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row MIG-9 (n/a (profile: server)) |
| SNAP-1 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row SNAP-1 (n/a (profile: server)) |
| SNAP-2 | delegated | - | core row SNAP-2 (implemented, n/a (pure)) · probe `/parseSnapshot/` binding 0, core 5 · the snapshot enters through `LangsysApp.loadSnapshot`, which the proxy forwards to the core unchanged; this binding does not parse, verify or override it. src/lib/snapshot-passthrough.test.ts: the core receives the very snapshot object and locale the app passed, and `loadSnapshot` is a bound forward, not an override (control); run through the binding, every `loads` row of `vectors/snapshot-vectors.json` (vendored byte-exact, blob `594bd77a`) renders through `$t` on the next line, and every `refusals` row reaches the app as the core's `SnapshotError` with the row's reason. Mutation: a binding override that clones the file before handing it on reds 2. The core offers no snapshot `init` option at this SHA, so `loadSnapshot` is the only entry |
| SNAP-3 | delegated | - | core row SNAP-3 (implemented, n/a (pure)) · probe `/markSeeded/` binding 0, core 2 · the snapshot enters through `LangsysApp.loadSnapshot`, which the proxy forwards to the core unchanged; this binding does not parse, verify or override it. src/lib/snapshot-passthrough.test.ts: the core receives the very snapshot object and locale the app passed, and `loadSnapshot` is a bound forward, not an override (control); run through the binding, every `loads` row of `vectors/snapshot-vectors.json` (vendored byte-exact, blob `594bd77a`) renders through `$t` on the next line, and every `refusals` row reaches the app as the core's `SnapshotError` with the row's reason. Mutation: a binding override that clones the file before handing it on reds 2. The core offers no snapshot `init` option at this SHA, so `loadSnapshot` is the only entry |
| BIND-1 | implemented | n/a (pure) | Adaptation is confined to Svelte's model: `Writable` → `Signal` (adapters.ts), a store form of `writeGrant` resolved per call, the hydration timing guard (stores.ts), a `serverMessage` store derived from `t`, and `syncNavigation()`, which only times the core's entry point. stores.test.ts; live, E2E TEST 1: the safe store reads `undefined` while the raw signal is `true` at hydration, console clean. Disabling the deferral reds 3 |
| BIND-2 | implemented | n/a (pure) | Artifact inspection with a control: own-rule probe `/write_enabled\|key_type\|auto_discovery\|autoDiscovery/` binding 0, core 42 (`_dev_/delegation-probe.mjs`, comments stripped, tests excluded). `writeEnabled` is surfaced as a tri-state and nothing in `src/lib` reads it to decide anything |
| BIND-3 | implemented | n/a (pure) | Own-rule probe `/fetch\(\|XMLHttpRequest\|sendBeacon\|setInterval\|keepalive\|headers/` binding 0, core 15. One timer exists, `setTimeout(…, 0)` in stores.ts, the hydration handover; it schedules no request. `syncNavigation()` sends nothing |
| BIND-4 | implemented | n/a (pure) | src/lib/config-surface.test.ts: the Svelte config's keys equal the core config's in both directions — `messagesCategory` included — as a type enforced by `npm run check`; control: the same machinery detects an invented key. The binding changes two keys' types (`UserLocaleStore` takes a `Writable`, `writeGrant` also takes a store) and adds none. Adding `discovery?: boolean` gives 1 svelte-check error |
| BIND-5 | implemented | n/a (pure) | `t` is the core's signal (surface.test.ts, `toBe`), and `LangsysApp.t` is the core's current `TFunction`: accessor values pass through the proxy unbound (removing that reds 3). `serverMessage` derives a function from `t` and keeps nothing. Own-rule probe `/memo\|[Cc]ache\|new Map\(\|new WeakMap\(/` binding 0, core 9 |
| BIND-6 | implemented | n/a (pure) | BIND-6 v2. (1) Proxy-forward over the core singleton with an `Object.hasOwn` override set of exactly `init` and `setWriteGrant`, set-equal to `OVERRIDDEN_MEMBERS`; `t`, `currentlyLoadedLocale`, `sTranslations`, `LangsysAppAPI`, `canonicalizeLocale`, `notifyNavigation`, `resolveServerMessages` and `renderServerMessage` by reference (`toBe`). Two deliberate additions, each a Svelte idiom over a core value: `writeEnabled` (hydration-safe) and `serverMessage` (reactive). `syncNavigation` lives in `./kit` so the main entry never imports `$app/*`. Reachability is generated from the core prototype, not listed. (2) The exported type is `Omit<typeof core, …> & {…}`, so core-private members are absent; surface.test.ts core-PRIVATE rows plus `enumerate-core-surface.mjs --self-test`. (3) No test or doc presents a core-private name as API. (4) `this` is the core: functions are bound to the target with the target as receiver — proxy-receiver.test.ts, where a naive proxy fails first on a `#private` fixture. (5) Destructuring works (surface.test.ts). Accessor values are never bound, so `t` keeps its identity; removing that reds 3 |
| GRANT-1 | implemented | n/a (pure) | `writeGrant` takes a string, a provider (sync or async), or — Svelte only — a store, which `adaptWriteGrant` turns into a provider (adapters.test.ts). README.md leads with the store and tells integrators to prefer a store or provider over a string, which goes stale when the token expires. Mutation: passing the store through unadapted reds 4 |
| GRANT-2 | implemented | n/a (pure) | The store is read on every provider call, never at adapt time (adapters.test.ts). Live corroboration, E2E TEST 8: writing an expired token into the store degrades the next request, `true → false`, with no imperative call. Mutation: snapshotting the store at adapt time reds 3 |
| GRANT-3 | implemented | live | E2E TEST 16: READ key with no grant paints `false`; the binding's `setWriteGrant(valid)` paints `true`, and that value is the re-authorization response's `write_enabled`, not local state. TEST 3: the call issues an authorize-project request carrying `X-Write-Grant`. Mutation: an override that resolves without calling the core reds 5 (TEST 3 ×2, TEST 16 ×3) |
| GRANT-4 | implemented | live | E2E TEST 8: a valid store-form grant flips a READ key — the grant arm, not the key type — and `X-Write-Grant` survives the cross-origin preflight. TEST 9: self-minted valid accepted, expired and no-`exp` refused. TEST 16: misses rendered after the grant land in the catalog. The delayed short-TTL case is not run as a delay; the server receives it exactly as TEST 9's already-expired token. Mutation: `init` dropping `writeGrant` reds 3 (TEST 8 ×3) |
| CACHE-1 | delegated | - | core row CACHE-1 (implemented, n/a (pure)) · probe `/langsys:translations/` binding 0, core 2 |
| CACHE-2 | delegated | - | core row CACHE-2 (implemented, contract) · probe `/catalogUnavailable/` binding 0, core 12 |
| OBS-1 | delegated | - | core row OBS-1 (implemented, contract) · probe `/noticeUnusableWriteCapability/` binding 0, core 4 |
| WIRE-1 | delegated | - | core row WIRE-1 (implemented, n/a (pure)) · probe `/x-Authorization\|X-Authorization/` binding 0, core 1 |
| WIRE-2 | delegated | - | core row WIRE-2 (implemented, contract) · probe `/204/` binding 0, core 1 |
| WIRE-3 | delegated | - | core row WIRE-3 (implemented, contract) · probe `/toLowerCase\|getCanonicalLocales/` binding 0, core 27 · locale.test.ts pins the re-exported `canonicalizeLocale` producing lowercase |
| WIRE-4 | delegated | - | core row WIRE-4 (implemented, contract) · probe `/\bsettle\(/` binding 0, core 5 · README-SSR tells SSR users to seed `{}`, never `null`, because a nullish catalog makes the core's `t()` throw |
| WIRE-5 | implemented | live | Redirect: the testbed points the SDK at `http://langsys2.test/api` with `init({ apiUrl })` through this binding's `init` override (harness.ts, grant route) — E2E TEST 7 sees requests arrive at that host, TEST 11 and TEST 16 read server state back from it. Findability: README.md "Pointing the SDK at another API" (src/docs.test.ts; mutation removing the section reds 1). The late-`setBaseUrl` ordering failure is the core's (core row WIRE-5) and is warned against in the same section |
| CONF-1 | implemented | contract | Rows graded on a property the API decides rest on server state, never on requests. Contract: HINT-13 and GATE-10 read `contract-fixture`'s accepted state (stored hints, registered phrases and blocks). Live: GRANT-3/4 on the authorization response body and catalog contents (E2E TEST 16), registration on 2xx plus presence in the catalog (TEST 11), no 4xx/5xx across the suite. Outgoing-request observations — TEST 3's header, TEST 10's report URLs — grade nothing on their own. Every path: MARK-1 and GATE-10 are proven per reader (`<Phrase>` and `<Translate>`), and the server path is measured separately (SRV-1) |
| CONF-2 | implemented | n/a (pure) | This file. `node _dev_/conformance-summary.mjs --check` reads the rule list out of the blob the header cites and fails on a missing, duplicate, family or unknown row, a non-canonical status or tier, `implemented` below live, contract or pure, and `delegated` with a tier; `--self-test` shows each check firing. The contract tier is `contract-fixture/`, vendored byte-exact and cited by tree `542f57f5ffcb9038db1b7411152b7e31b96cb269`. Absences: HINT-13's no-hint-for-B and GATE-10's suppressions are each evidence because a sibling case in the same run shows the double accepting that action for the same key — a stored hint for B, a registered unmarked block — and neither rule is about a capability the SDK learned, so no drift applies. Capability-drift rows are delegated to the core, which drifts them (core rows GATE-1, HINT-9). No row is provisional |
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
node --env-file=.env _dev_/e2e/verify.mjs         # 61/61, about 160 s

# SRV concurrency — its own freshly started server; no API, no .env
node _dev_/e2e/srv-concurrency.mjs                # body seed 0/800 wrong-locale; control 388/800
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
| SSR-3 | demote README.md's `[!IMPORTANT]` callout to a plain blockquote | 1 (docs.test.ts) |
| WIRE-5 | rename README.md's "Pointing the SDK at another API" section | 1 (docs.test.ts) |

The SNAP mutation ran against core `a639ae8c`, the MIG one against `2d57cdd9`, the HINT-13, GATE-10 and MSG-5 ones against
`86871033`; the rest ran against earlier core builds of this branch and touch only binding code
that has not changed since.

## Release-wave items

- **`dependencies.langsys-js-typescript` is `^0.6.4`, and the lockfile resolves registry `0.6.5`**,
  which predates this ticket. The range must match the core version that ships in the same wave.
  Until then a clean clone installs a core without the 838 surface, and CI on this branch cannot
  go green.
- **`langsys-js-svelte/kit`** is a new subpath export (`package.json` `exports`), and a published
  surface from the first release that carries it. `@sveltejs/kit` is declared an optional peer for it.
