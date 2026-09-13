# Conformance — langsys-js-svelte

| | |
|---|---|
| **Spec revision read** | langsys2 5cff03a1…, docs/sdk-spec.mdx blob 5c5c0723f88fb8e6b13f58876c7adca8b6b35691 |
| **Profiles** | browser, binding, all — derived: binding over langsys-js-typescript |
| **specVersion** | 8.0.1 — a post-publication correction to v8, unpublished |
| **Re-derived at this write** | `git -C ../langsys2 ls-tree 5cff03a17751e7dae9dcf1af52a9454d027c9006 docs/sdk-spec.mdx` → `5c5c0723…`. The 79 rule ids are read out of that blob by `node _dev_/conformance-summary.mjs`, not counted from this file. The previous revision of this file cited blob `06ae105a` (v7, 67 rules) and did not change when the spec did. |
| **Binding revision** | `feature/838_write_key_gating_reland`. The commit carrying this file is the one reported to the reviewer; a SHA written here could only name its parent. |
| **Core under test** | Resolved, never quoted: `node _dev_/delegation-probe.mjs` prints the checkout the symlink reaches. At this write `feature/838_write_key_gating_reland` @ `f58e0c4`, clean under `src/`. It was `4eac870` with three uncommitted files earlier the same afternoon; the core rows cited below were re-read at `f58e0c4`. |
| **Suites** | unit 124 tests in 9 files (`npm test -- --run`, no network) · E2E 61 assertions, live (`_dev_/e2e/verify.mjs`) |

## What surfaced while writing this

Every item below was found by running something against this binding, not by reading the spec.

1. **`LangsysApp.t` was a different function on every read.** The proxy bound every function it
   forwarded — including the `TFunction` the core's `t` getter returns. Measured: `core.t === core.t`
   held, `LangsysApp.t === LangsysApp.t` did not, each read a fresh `bound fn`. That identity is the
   reactivity contract. Fixed: accessor values pass through unbound, methods stay bound.
2. **Under SSR, `<Translate>` and `<Phrase>` serve the base language however complete the catalog
   is.** Measured on served bytes: both construct their core handler in `$effect`, which never runs
   during a server render. `$t()` does serve the request locale, but only through README-SSR's
   process-global seed. Not built — see SRV-1.
3. **A persistent `+layout.svelte` captures no URL for the route it now sits under.** Measured with
   a page-level positive control (HINT-4). The previous file graded HINT-4 `implemented`.
4. **The `'server'` strategy's allow-list precondition was the last sentence of a callout about
   something else**, in both shipped READMEs. SSR-3 asks for its own callout. Fixed and pinned.
5. **`apiUrl` was undocumented here**, and the testbed redirected with the order-sensitive
   `LangsysAppAPI.setBaseUrl()` — proving a path integrators are told to avoid. Fixed (WIRE-5).
6. **Three delegation controls had only ever fired on comments.** `snapshot`, `jitter` and
   `access_token|session_state` count 0 in the core once comments are stripped on the core side too.
   Replaced with code symbols.
7. **Three checks that could not fail.** E2E TEST 5 read the layout's phrase instead of the nav card,
   and passed on `undefined === undefined`. TEST 8's store re-read row checked only the final value,
   so a mutation that dropped the grant from `init` passed it as `false -> false`; it now requires the
   flip at init first. A new served-bytes assertion imported
   `CONTENT_BLOCK_MARKER_ATTR` from the core's main entry, where it is `undefined` —
   `not.toContain(undefined)` passes against any body. The unit run was green; `svelte-check` caught
   it. All three fixed with premises.
8. **The previous file graded family names, not rules.** Expanded it covered 57 of 79 ids and
   contradicted itself in seven places, and its summary script counted grade cells rather than ids.

## Gaps, ranked by cost

1. **SRV-1** — `<Translate>` and `<Phrase>` content reaches crawlers, link previews and no-JS readers
   in the base language under a localised URL. SEO cost lands on the customer, silently.
2. **SRV-2** — no request-scoped catalog. Correct today only because Svelte's default renderer is
   synchronous; `experimental.async` with an await before a read in the same script served the wrong
   locale 3 times in 4. Intermittent, under traffic.
3. **HINT-4** — layout-level content is never attributed to any URL after the first. Discovery cannot
   say which other pages carry it. Documented mitigation: discoverable content in `+page`.
4. **SRV-4** — no tested hydration hand-off, and the documented seed bypasses the core's `seedCatalog`.
5. **SRV-3** — collection is not ordered after the response flush. Latency, `'server'` strategy only.
6. **SRV-5** — follows SRV-1: there is no server-side capture to count.

SRV-1..5 are measured and not built, per the plan: whether server rendering of components lives in
JS Server 0.2.0 adapters or in each binding is an open operator decision.

## Status

| Rule | Status | Tier | Evidence |
|---|---|---|---|
| GATE-1 | delegated | - | core row GATE-1 (provisional, mock) · probe `/write_enabled/` binding 0, core 9 · corroborated through the binding, live: E2E TEST 2 read → false, ip_write → true, write → true; TEST 13 painted value equals the authorize-project body |
| GATE-2 | delegated | - | core row GATE-2 (provisional, mock) · probe `/applyWriteEnabled\|canWrite/` binding 0, core 6 · the binding's `writeEnabled` wrapper keeps unknown as `undefined`, never `false` (stores.test.ts) — surfacing, not a lane decision |
| GATE-3 | delegated | - | core row GATE-3 (provisional, no test) · probe `/localStorage\|sessionStorage\|setWriteEnabled/` binding 0, core 5 · the one module-level flag here, `pastHydration` (stores.ts), records hydration timing, not the decision. The GATE-3 carve-out is not taken |
| GATE-4 | delegated | - | core row GATE-4 (provisional, no test) · probe `/persistScoped\|catalogCache/` binding 0, core 6 |
| GATE-5 | delegated | - | core row GATE-5 (provisional, mock) · probe `/updateTokens/` binding 0, core 7 |
| GATE-6 | delegated | - | core row GATE-6 (provisional, mock) · probe `/recordMissForDiscovery/` binding 0, core 5 |
| GATE-7 | delegated | - | core row GATE-7 (provisional, mock) · probe `/registerContentBlock/` binding 0, core 4 · every detecting path here is the core's: `$t` is the core signal, `<Translate>` and `<Phrase>` construct core handlers. Documented edge: under `'client'`, content rendered only during SSR feeds neither lane — SSR-1's required non-collection, stated in both READMEs |
| GATE-8 | delegated | - | core row GATE-8 (implemented, mock) · probe `/key_type/` binding 0, core 18 · the tri-state is surfaced unchanged; stores.test.ts "never substitutes false for not known yet" |
| CAT-1 | delegated | - | core row CAT-1 (implemented, n/a (pure)) · probe `/buildTFn\|missingToken/` binding 0, core 35 · `t` is the core's signal by identity (surface.test.ts), so no lookup runs here |
| CAT-2 | delegated | - | core row CAT-2 (implemented, n/a (pure)) · probe `/\blookup\(/` binding 0, core 2 |
| CAT-3 | delegated | - | core row CAT-3 (provisional, no test) · probe `/isContentBlockKnown/` binding 0, core 5 |
| REG-1 | delegated | - | core row REG-1 (provisional, mock) · probe `/canWrite/` binding 0, core 2 |
| REG-2 | delegated | - | core row REG-2 (provisional, mock) · probe `/debounceTimer\|scheduleTokenFlush/` binding 0, core 9 |
| REG-3 | delegated | - | core row REG-3 (provisional, mock) · probe `/flushOnTeardown/` binding 0, core 3 |
| REG-4 | delegated | - | core row REG-4 (provisional, mock) · probe `/keepalive\|sendBeacon/` binding 0, core 7 |
| REG-5 | delegated | - | core row REG-5 (provisional, mock) · probe `/installTeardownFlush\|visibilitychange\|pagehide/` binding 0, core 4 |
| REG-6 | delegated | - | core row REG-6 (provisional, mock) · probe `/\[\.\.\.this\.missingTokens\]/` binding 0, core 2 · replaces `/snapshot/`, whose core count was 0 once comments were stripped |
| REG-7 | delegated | - | core row REG-7 (provisional, mock) · probe `/updateInFlight/` binding 0, core 4 |
| REG-8 | delegated | - | core row REG-8 (provisional, mock) · probe `/consecutiveFailures\|retryNotBefore/` binding 0, core 10 |
| REG-9 | delegated | - | core row REG-9 (provisional, mock) · probe `/batch_limit/` binding 0, core 2 |
| REG-10 | delegated | - | core row REG-10 (provisional, mock) · probe `/noteSendFailure\|createTranslatableItems/` binding 0, core 6 |
| REG-11 | delegated | - | core row REG-11 (implemented, mock; that row records its suppression half as not implemented) · probe `/warnedEllipsis/` binding 0, core 3 |
| REG-12 | delegated | - | core row REG-12 (provisional, no test) · probe `/missingToken/` binding 0, core 31 |
| HINT-1 | delegated | - | core row HINT-1 (implemented, mock) · probe `/discovery/hint/` binding 0, core 1 |
| HINT-2 | n/a (profile: server) | - | Profiles: server. A browser binding cannot be the origin HINT-2 describes, so it cannot fail it. This row is only as fresh as HINT-2's Profiles line, which sits inside that rule's revision |
| HINT-3 | delegated | - | core row HINT-3 (provisional, mock) · probe `/recordMissForDiscovery\|location\.href/` binding 0, core 5 · through the binding, E2E TEST 10: a miss on one route, a client-side navigation inside the jitter window, two reports each naming its own URL — observed as the outgoing report, since the endpoint answers 204 either way and keeps nothing a test can read |
| HINT-4 | not implemented | - | Known non-capture for the persistent-layout shape, recorded as HINT-4's note requires. Measured, E2E TEST 14, in real Chromium through SvelteKit's own client router (a link click, awaited with `waitForURL`). Both controls hold: the page's own `window.location` moved to the new route, and the page component mounted by that navigation entered `t()` at the new URL (1 entry). Against them, the `+layout.svelte` phrase re-entered `t()` 0 times (3 → 3) and recorded 0 entries at the new URL. The per-URL dedup itself is the core's (core row HINT-4, provisional, mock). Closes when the navigation entry point lands. README.md states the consequence: put discoverable content in `+page`, not `+layout` |
| HINT-5 | delegated | - | core row HINT-5 (provisional, mock) · probe `/HINT_MIN_DELAY_MS\|HINT_MAX_DELAY_MS/` binding 0, core 5 · replaces `/jitter/`, core 0 once comments were stripped |
| HINT-6 | delegated | - | core row HINT-6 (implemented, n/a (pure)) · probe `/normalizeHintUrl/` binding 0, core 2 |
| HINT-7 | delegated | - | core row HINT-7 (provisional, mock) · probe `/429/` binding 0, core 1 |
| HINT-8 | delegated | - | core row HINT-8 (provisional, mock) · probe `/postDiscoveryHint/` binding 0, core 2 |
| HINT-9 | delegated | - | core row HINT-9 (provisional, mock) · probe `/auto_discovery\|autoDiscovery/` binding 0, core 13 |
| HINT-10 | delegated | - | core row HINT-10 (implemented, n/a (pure)) · probe `/passwd\|apikey/` binding 0, core 2 |
| HINT-11 | delegated | - | core row HINT-11 (implemented, n/a (pure)) · probe `/fragmentParamNames\|OAUTH_STATE_MARKERS/` binding 0, core 4 · replaces `/access_token\|session_state/`, core 0 once comments were stripped |
| HINT-12 | delegated | - | core row HINT-12 (implemented, mock) · probe `/utm_\|gclid\|fbclid/` binding 0, core 3 |
| ICU-1 | delegated | - | core row ICU-1 (corroborated cross-implementation, contract) · probe `/IntlMessageFormat/` binding 0, core 4 |
| ICU-2 | delegated | - | core row ICU-2 (corroborated cross-implementation, contract) · probe `/\binterpolate\(/` binding 0, core 4 |
| ICU-3 | delegated | - | core row ICU-3 (corroborated cross-implementation, contract) · probe `/_recoverMissingArgs/` binding 0, core 5 |
| ICU-4 | delegated | - | core row ICU-4 (implemented, n/a (pure)) · probe `/noteDefaultedArgs/` binding 0, core 2 |
| ICU-5 | delegated | - | core row ICU-5 (corroborated cross-implementation, contract) · probe `/isICU/` binding 0, core 4 |
| CID-1 | delegated | - | core row CID-1 (corroborated cross-implementation, contract) · probe `/canonicalContentBlockJson/` binding 0, core 4 |
| CID-2 | delegated | - | core row CID-2 (implemented, n/a (pure)) · probe `/generateCustomId/` binding 0, core 8 · the testbed imports it to re-derive MARK-1; `src/routes` is not the binding and does not ship |
| CID-3 | delegated | - | core row CID-3 (implemented, mock) · probe `/generateLegacyCustomId/` binding 0, core 6 · "JS and its bindings: call the exported functions; do not reimplement them" — nothing here hashes |
| CID-4 | delegated | - | core row CID-4 (corroborated cross-implementation, contract) · probe `/legacyTokenizeElement/` binding 0, core 4 |
| TOK-1 | delegated | - | core row TOK-1 (implemented) · probe `/noscript/` binding 0, core 1 · `<Translate>` hands its host to the core `Translate` class, which does the walking |
| TOK-2 | delegated | - | core row TOK-2 (implemented) · probe `/normalizeTokenText/` binding 0, core 16 |
| TOK-3 | delegated | - | core row TOK-3 (implemented) · probe `/aria-roledescription/` binding 0, core 1 |
| TOK-4 | delegated | - | core row TOK-4 (implemented) · probe `/translateAttribute/` binding 0, core 6 |
| TOK-5 | delegated | - | core row TOK-5 (implemented) · probe `/normalizeMarkupPlaceholders\|adoptPercentPlaceholders/` binding 0, core 19 · this binding documents `%name%` as the markup form because Svelte compiles a bare `{name}`; E2E TEST 12 renders it through `<Translate>` and `<Phrase>` |
| MARK-1 | implemented | n/a (pure) | Proven per surface. `<Phrase>`: this binding stamps the host with the core's own `PHRASE_MARKER_ATTR` (Phrase.svelte) — E2E TEST 13 with a bogus-marker control, and present in served bytes (served-bytes.test.ts); mutation removing the spread reds 1. `<Translate>`: the core class stamps this binding's host — E2E TEST 15 re-derives the id in the page by running the core tokenizer over the host and hashing with `generateCustomId`; stamp equals derived, and a perturbed token list does not match. Server bytes carry no content-block stamp (served-bytes GAP row; SRV-1) |
| MARK-2 | delegated | - | core row MARK-2 (implemented) · probe `/PHRASE_MARKER_ATTR_LEGACY\|isPhraseMarked/` binding 0, core 9 · this binding writes one spelling and reads none |
| SSR-1 | delegated | - | core row SSR-1 (provisional, mock) · probe `/shouldQueueForWrite/` binding 0, core 2 · both READMEs state that `'client'` collects nothing server-side |
| SSR-2 | delegated | - | core row SSR-2 (provisional, mock) · probe `/ssrWriteEnabled/` binding 0, core 3 · corroborated once through the binding by the `/e2e/ssr-write` procedure (a valid grant degrades `'server'` and registers 0; no grant registers 2), not re-run at this write |
| SSR-3 | implemented | n/a (pure) | src/docs.test.ts: README.md and README-SSR.md, both shipped, each carry an `[!IMPORTANT]` callout that leads with the allow-list precondition. Controls: the parser finds README-SSR's known `[!WARNING]`, and rejects README.md's plain discovery-gap blockquote, which mentions the allow-list in its last sentence — the footnote shape the rule forbids, and the shape both READMEs had before this write. Mutation: callout demoted to a blockquote reds 1. The refused side belongs to the core and the backend and cannot be produced here |
| SRV-1 | partial | n/a (pure) | src/ssr-measure/served-bytes.test.ts, on served bytes. Under README-SSR's component-body seed, `$t()` serves the request locale and the base language for a genuine miss in the same render; control: an empty catalog serves base. `<Translate>` and `<Phrase>` serve base language with the translation present under both lookup shapes, because both construct their handler in `$effect`, which SSR never runs — pinned as GAP rows that go red when it closes. `$t()`'s half rests on a process-global write (SRV-2). Not built, per the plan |
| SRV-2 | not implemented | - | No request scope exists. The catalog is the core's module-global `sTranslations`, and README-SSR's seed writes it per request — which the rule's MUST forbids by construction. The pattern's concurrency safety is a property of Svelte's synchronous renderer, measured and published in README-SSR: 0 of 400 wrong-locale responses seeded in a layout body, 70 of 80 seeded in a hook that awaits, 3 of 4 under `experimental.async` with an await before the read in the same script. Those harnesses are not committed, so they explain this grade and support no conformance claim |
| SRV-3 | not implemented | - | Nothing orders collection after the response flush. Under the default `'client'` the server collects nothing, so neither MUST can be observed failing; under `'server'` the core's debounced flush runs in Node with no tie to SvelteKit's response lifecycle. No test asserts the order of events. The core rows SRV-3 profile-n/a for itself |
| SRV-4 | not implemented | - | The rule splits. Core half: `seedCatalog` is synchronous (core row SRV-4) and reachable through this binding's proxy with no override (surface.test.ts generated reachability). Binding half — calling it before hydration so the first client render matches the served HTML, with the mismatch control — has no test. README-SSR's seed writes `sTranslations` and `currentlyLoadedLocale` directly instead of calling `seedCatalog`, which also injects `__uncategorized__`, stamps `__category__` and marks the locale loaded: a second implementation of seeding, in user code. Not rewritten here, because README-SSR's measured guidance is not restated without re-measuring |
| SRV-5 | not implemented | - | No server-side child capture exists: `<Translate>` and `<Phrase>` do nothing during SSR (served-bytes.test.ts GAP rows), so there is no per-subtree count to assert and no uncapturable child to fail loudly on. Measurable once capture lands |
| BIND-1 | implemented | n/a (pure) | Adaptation is confined to Svelte's model: `Writable` → `Signal` (adapters.ts), a store form of `writeGrant` resolved per call (GRANT-2), and the hydration timing guard (stores.ts), which changes when `writeEnabled` is observable and never what it is. stores.test.ts (mocks the core to drive the signal); live corroboration E2E TEST 1: the safe store reads `undefined` while the raw signal is `true` at hydration, console clean. Mutation: disabling the deferral reds 3 |
| BIND-2 | implemented | n/a (pure) | Artifact inspection with a control: own-rule probe `/write_enabled\|key_type\|auto_discovery\|autoDiscovery/` binding 0, core 40 (`_dev_/delegation-probe.mjs`, comments stripped, tests excluded). `writeEnabled` is surfaced as a tri-state and nothing in `src/lib` reads it to decide anything |
| BIND-3 | implemented | n/a (pure) | Own-rule probe `/fetch\(\|XMLHttpRequest\|sendBeacon\|setInterval\|keepalive\|headers/` binding 0, core 15. One timer exists: `setTimeout(…, 0)` in stores.ts, the hydration handover BIND-1 names as legitimate. It schedules no request |
| BIND-4 | implemented | n/a (pure) | src/lib/config-surface.test.ts: the Svelte config's keys equal the core config's in both directions, as a type enforced by `npm run check`; control: the same machinery detects an invented key. The binding changes two keys' types (`UserLocaleStore` takes a `Writable`, `writeGrant` also takes a store) and adds none. Mutation: adding `discovery?: boolean` gives 1 svelte-check error |
| BIND-5 | implemented | n/a (pure) | `t` is the core's signal (surface.test.ts, `toBe`), and `LangsysApp.t` is the core's current `TFunction` (accessor rows — fixed at this write, mutation reds 3). Own-rule probe `/memo\|[Cc]ache\|new Map\(\|new WeakMap\(/` binding 0, core 8. A persistent layout not re-entering is Svelte's model, not a cache — see HINT-4 |
| BIND-6 | implemented | n/a (pure) | BIND-6 v2. (1) Proxy-forward over the core singleton with an `Object.hasOwn` override set of exactly `init` and `setWriteGrant`, set-equal to `OVERRIDDEN_MEMBERS`; `t`, `currentlyLoadedLocale`, `sTranslations`, `LangsysAppAPI` and `canonicalizeLocale` by reference (`toBe`); one deliberate exception, `writeEnabled`. No hand list — reachability is generated from the core prototype, for the forward-looking reason and not the five. (2) The exported type is `Omit<typeof core, …> & {…}`, keyed over the core's type, so core-private members are absent; the private probe and its control are surface.test.ts's core-PRIVATE rows plus `enumerate-core-surface.mjs --self-test` and its PRIVATE-IN-DTS column. (3) No test or doc presents a core-private name as API. (4) `this` is the core: functions bound to the target, with the target as receiver — proxy-receiver.test.ts, where a naive proxy fails first on a `#private` fixture. (5) Destructuring, which the shipped class wrapper supported, still works (surface.test.ts). Accessor values are never bound, so `t` keeps its identity — fixed at this write, mutation reds 3 |
| GRANT-1 | implemented | n/a (pure) | `writeGrant` takes a string, a provider (sync or async), or — Svelte only — a store, which `adaptWriteGrant` turns into a provider (adapters.test.ts). README.md leads with the store and tells integrators to prefer a store or provider over a string, which goes stale when the token expires. Mutation: passing the store through unadapted reds 4 |
| GRANT-2 | implemented | n/a (pure) | The store is read on every provider call, never at adapt time (adapters.test.ts). Live corroboration, E2E TEST 8: writing an expired token into the store degrades the next request, `true → false`, with no imperative call. Mutation: snapshotting the store at adapt time reds 3 |
| GRANT-3 | implemented | live | E2E TEST 16: READ key with no grant paints `false`; the binding's `setWriteGrant(valid)` paints `true`, and that value is the re-authorization response's `write_enabled`, not local state. TEST 3: the call issues an authorize-project request carrying `X-Write-Grant`. Mutation: an override that resolves without calling the core reds 5 (TEST 3 ×2, TEST 16 ×3) |
| GRANT-4 | implemented | live | E2E TEST 8: a valid store-form grant flips a READ key — the grant arm, not the key type — and `X-Write-Grant` survives the cross-origin preflight. TEST 9: self-minted valid accepted, expired and no-`exp` refused. TEST 16: misses rendered after the grant land in the catalog. The delayed short-TTL case is not run as a delay; the server receives it exactly as TEST 9's already-expired token. Mutation: `init` dropping `writeGrant` reds 3 (TEST 8 ×3) |
| CACHE-1 | delegated | - | core row CACHE-1 (implemented, mock) · probe `/langsys:translations/` binding 0, core 2 |
| OBS-1 | delegated | - | core row OBS-1 (implemented, mock) · probe `/noticeUnusableWriteCapability/` binding 0, core 4 |
| WIRE-1 | delegated | - | core row WIRE-1 (provisional, mock) · probe `/x-Authorization\|X-Authorization/` binding 0, core 1 |
| WIRE-2 | delegated | - | core row WIRE-2 (provisional, mock) · probe `/204/` binding 0, core 1 |
| WIRE-3 | delegated | - | core row WIRE-3 (implemented, n/a (pure)) · probe `/toLowerCase\|getCanonicalLocales/` binding 0, core 22 · locale.test.ts pins the re-exported `canonicalizeLocale` producing lowercase, which this binding's docs once contradicted |
| WIRE-4 | delegated | - | core row WIRE-4 (provisional, no test) · probe `/\bsettle\(/` binding 0, core 5 · README-SSR tells SSR users to seed `{}`, never `null`, because a nullish catalog makes the core's `t()` throw |
| WIRE-5 | implemented | live | Redirect: the testbed points the SDK at `http://langsys2.test/api` with `init({ apiUrl })` through this binding's `init` override (harness.ts, grant route) — E2E TEST 7 sees requests arrive at that host, TEST 11 and TEST 16 read server state back from it. Findability: README.md "Pointing the SDK at another API" (src/docs.test.ts; mutation removing the section reds 1). The late-`setBaseUrl` ordering failure is the core's (core row WIRE-5) and is warned against in the same section |
| CONF-1 | implemented | live | Rows graded `implemented` on a property the API decides rest on server state: GRANT-3 and GRANT-4 on the authorization response body and catalog contents (TEST 16), registration on 2xx plus presence in the catalog (TEST 11), and no 4xx/5xx across the suite. Outgoing-request observations — TEST 3's header, TEST 10's report URLs — grade nothing on their own: HINT-3 is delegated and GRANT-3 cites TEST 16. Every path: MARK-1 is proven per surface (`<Phrase>` TEST 13, `<Translate>` TEST 15), and its absence on the server path is measured (SRV-1), not asserted met |
| CONF-2 | implemented | n/a (pure) | This file. `node _dev_/conformance-summary.mjs --check` reads the rule list out of the blob the header cites and fails on a missing, duplicate, family or unknown row, a non-canonical status or tier, `implemented` below live, contract or pure, and `delegated` with a tier; `--self-test` shows each check failing on a synthetic file. The live tier is re-runnable on demand — see Evidence. No row is provisional: none rests on mock evidence, so the shared contract fixture would move nothing here |
| CONF-3 | implemented | n/a (pure) | Mutations are recorded per row and tabled under Mutations, each with what it reds. SSR strategy cases run one fresh process each (`/e2e/ssr-write`, `_dev_/e2e/README.md`), which is why `verify.mjs` excludes them — and the E2E run behind this file started from a freshly started dev server |

## Reading a row

**Tier** records the evidence for the property the rule governs, not whether a double appears in a
test. `live` applies only where that property depends on what the API answers — acceptance, refusal,
state across calls — and only because the harness is committed and re-runnable. `n/a (pure)` covers
in-process and DOM behaviour, inspection of a shipped artifact with a positive control, and
meta-rules. A `delegated` row takes `-`.

**`delegated`** means the core owns the rule and this binding demonstrably takes no part. Each row
names the core row, read in `langsys-js-typescript/CONFORMANCE.md` at the core SHA above, and one
probe pattern for that rule alone — never one per family. `node _dev_/delegation-probe.mjs --check`
counts each pattern with comments stripped on both sides and tests excluded, and fails unless the
binding count is 0 **and** the core count is above 0 — the core count is the control proving the
search could have found something. It also fails if a delegated row here has no probe, or a probe
has no delegated row. The counts in the rows are those at the core SHA above; the invariant, not the
number, is what `--check` enforces as the core moves.

**Own-rule probes.** BIND-2, BIND-3 and BIND-5 are this binding's own rules, graded `implemented`,
and their absence halves use the same instrument and the same control.

## Evidence — and re-running it

**Unit** — `npm test -- --run`. No network, no environment. Includes the served-bytes measurement
(`src/ssr-measure`) and the docs checks (`src/docs.test.ts`). `npm run check` carries BIND-4's type.

**E2E, live** — committed and re-runnable from this repo against the local langsys2 stack:

```bash
# once: npx playwright install chromium; a .env per .env.example (gitignored);
#       the local project seeded with langsys2's SdkIntegrationSeeder; the core symlinked
npm run dev                                   # 127.0.0.1:5173, freshly started
node --env-file=.env _dev_/e2e/verify.mjs     # 61/61 at this write, 127 s
```

Re-run on demand at this write, from a freshly started dev server. The reproducibility boundary is
the local stack — API, database seed, keys — which is the same stack the backend lane runs; nothing
lives in a session scratchpad.

**Conformance tooling**

```bash
node _dev_/conformance-summary.mjs --check      # this file against the cited blob, by rule id
node _dev_/conformance-summary.mjs --self-test
node _dev_/delegation-probe.mjs --check         # delegated rows + own-rule probes, with controls
node _dev_/delegation-probe.mjs --self-test
node _dev_/enumerate-core-surface.mjs --self-test
```

## Mutations

Each performed, observed red, and restored, at this write unless the row says otherwise. The two live mutations ran together in one E2E run on a freshly started server; they touch disjoint tests (TEST 3 and 16 call `setWriteGrant`, TEST 8 passes the grant to `init`), so each red is attributable. That run also exposed TEST 8's store re-read row passing as `false -> false` with no grant at all; it now requires the flip at init, and the counts above are from the run after that fix.

| Rule | Mutation | Red |
|---|---|---|
| BIND-1 | `if (pastHydration)` → `if (true)` in stores.ts (no hydration deferral) | 3 (stores.test.ts) |
| BIND-4 | add `discovery?: boolean` to the Svelte config | 1 svelte-check error |
| BIND-5, BIND-6 | remove the accessor check from the proxy handler | 3 (1 fixture row, 2 core-generated rows) |
| BIND-6 | hide `init` from `OVERRIDDEN_MEMBERS` / delete the `init` override / hide `getCountries` behind the proxy | 1 / 2 / 1 — measured when introduced (CHANGELOG, Unreleased), not re-run at this write |
| BIND-6 | forward with the proxy as receiver | proxy-receiver.test.ts fixture rows — measured when introduced, not re-run |
| GRANT-1 | `adaptWriteGrant` passes a store through unadapted | 4 (adapters.test.ts) |
| GRANT-2 | `adaptWriteGrant` snapshots the store at adapt time | 3 (adapters.test.ts) |
| GRANT-3 | the `setWriteGrant` override resolves without calling the core | 5 — E2E TEST 3 ×2 (no re-authorization, no header), TEST 16 ×3 (no flip, no response decision, nothing in the catalog) |
| GRANT-4 | the `init` override drops `writeGrant` | 3 — E2E TEST 8 ×3 (no flip at init, no header, store re-read) |
| MARK-1 | remove `{...markerAttr}` from Phrase.svelte | 1 (served-bytes.test.ts) |
| SSR-3 | demote README.md's `[!IMPORTANT]` callout to a plain blockquote | 1 (docs.test.ts) |
| WIRE-5 | rename README.md's "Pointing the SDK at another API" section | 1 (docs.test.ts) |

## Release-wave items

Not defects to fix now; conditions that only the release wave can close.

- **`dependencies.langsys-js-typescript` is `^0.6.4`, and the lockfile resolves registry `0.6.5`**,
  which predates 838. The range must match the core version that ships in the same wave. Until then
  a clean clone installs a core without the 838 surface, and CI on this branch cannot go green —
  including for the testbed and `src/ssr-measure`, which import the core's `/pure` subpath.
- **Locally the core is a gitignored symlink** to the shared `langsys-js-typescript` checkout, which
  moves; hence every core SHA here is resolved by a script and stamped, never carried.

## Corrections recorded as corrections

- **HINT-4 was graded `implemented`** in the previous file, on live evidence that two URLs produced
  two reports. That evidence was real and answered a different question: the rule's note is about a
  persistent layout, which captures no URL at all for the new route. Now `not implemented`, with the
  measurement.
- **Family rows.** "REG", "HINT", "CAT", "CID", "GATE", "CACHE" and "ICU" were each graded once;
  expanded, GATE-1, GATE-3, GATE-8, HINT-3 and HINT-4 were both `implemented` and family-`delegated`,
  HINT-2 was `delegated` and `n-a`, and SSR-3 was `partial` and `open`. Every id is rowed once now.
- **The summary counted cells, not rules.** It printed a clean total for a file missing 22 ids. The
  checker now reads the ids from the spec blob the header cites.
- **Grades moved on the tier guidance, not on new facts.** GATE-1, GATE-3, GATE-8, WIRE-3, SSR-1 and
  SSR-2 were `implemented` on live or code evidence that the binding does not take part; the core owns
  each, so they are `delegated` with that evidence as corroboration.
- **Carried from the v7 file, still true:** `docs-api-coverage` once validated an eleven-day-old
  `dist` and was run without `--strict`; the `#private` fixture once tested a re-implementation of the
  handler rather than the shipped one; `prop in overrides` walked `Object.prototype`; an override
  assertion compared a bound copy to the original and could never fail; `<Phrase>` hardcoded the
  core's marker; locale casing was documented backwards; two E2E assertions sat after
  `browser.close()` and never ran; a rendered-output control compared against a Node-process signal
  that was never initialised. Each is described where it was fixed, in the CHANGELOG.
