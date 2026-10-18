# Conformance — langsys-js-svelte

| | |
|---|---|
| **Spec revision read** | langsys2 fec9d822…, docs/sdk-spec.mdx blob 792133e0aaa2e113544f339b09d421e9f69dba99 |
| **Profiles** | browser, binding, all — derived: binding over langsys-js-typescript |
| **specVersion** | 8.6.0, unpublished |
| **Re-derived at this write** | `git -C ../langsys2 ls-tree fec9d822b4607795dfdf1b0a70478407ebc01556 docs/sdk-spec.mdx` → `792133e0…`. The 130 rule ids are read out of that blob by `node _dev_/conformance-summary.mjs`, not counted from this file. |
| **Binding revision** | `feature/838_write_key_gating_reland`. The commit carrying this file is the one reported to the reviewer; a SHA written here could only name its parent. |
| **Core under test** | `langsys-js-typescript` `a5954a3cdde0b0e96eea1b7386a663935b8e3edb`, built clean from a detached worktree of that SHA and linked in place of the shared checkout, which carries uncommitted work. `node _dev_/delegation-probe.mjs` prints the checkout it resolves. Every `core row` citation below is read from that SHA's CONFORMANCE.md. |
| **Contract fixture** | `contract-fixture/`, vendored byte-exact from langsys-js-typescript, tree `39ecf1292b4708719256431e44730eb94ca2b1ab` (`git rev-parse HEAD:contract-fixture`). Node 18+, no dependencies. |
| **Shared vectors** | Vendored byte-exact under `vectors/`: `server-message-vectors.json`, blob `7333e3919dac43af81c6c20bfdba974efd79725b`; `snapshot-vectors.json`, blob `594bd77a0289abfdf608508ac93cc9f4c4f88459`; `var-naming-vectors.json`, blob `0513e1cb215edd9df2e5b34a04cc3e5d2cfcc034`; `canonicalization-reference.json`, blob `525afacddcd2ffcb88a7b5b3e957fc69ee987f6b`. |
| **Suites** | unit 374 tests in 28 files (`npm test -- --run`, no network) · contract 22 assertions (`_dev_/contract/verify-contract.mjs`) · E2E 61 assertions, live (`_dev_/e2e/verify.mjs`) · SRV concurrency 6 assertions (`_dev_/e2e/srv-concurrency.mjs`) · SRV-7 scope 9 assertions (`_dev_/e2e/srv-scope.mjs`) · SRV-3 flush 6 + 6 assertions (`_dev_/e2e/srv-flush.mjs`, write and read keys) · Svelte DOM 17 assertions (`_dev_/e2e/svelte-dom.mjs`) · VAR 41 assertions (`_dev_/e2e/var.mjs`, contract) · locale race 4 assertions (`_dev_/e2e/locale-race.mjs`, contract) · running without credentials 8 assertions (`_dev_/e2e/credentials.mjs`, contract) · the published preprocessor entry 4 assertions (`_dev_/preprocess-entry.mjs`, after `npm run package`) |

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
4. **Under `requireCredentials`, a block mounted before `init()` never surfaced the error.**
   SvelteKit mounts a page before its layout's `onMount`; the core now rejects such a
   registration once `init()` refuses (core `b3b2f5b`), which `_dev_/e2e/credentials.mjs` counts.
5. **Two unnameable values of one shape shared a placeholder** (`{a + b}` and `{c * d}` both
   `{value}`). The core names them `value` and `value_2` (core `27f9151c`), and the shared vectors
   carry both rows.
6. **A server render outside a request scope waited on the core's readiness for good.** The core
   resolves such a registration at once (core `4104889`), and this binding registers on the server
   only inside a request scope.
7. **A readable block inside a fallback block lost its value after hydration.** The fallback's walk
   took over the host the binding renders and re-rendered its source without the inner values
   (`Foto di {name}`). The core's `registerBlock` claims that host (core `f977ad62`).
8. **Under `requireCredentials`, some read-only blocks rejected.** A `register: false` block is a
   read on every path and never rejects; the option fails on the first `t()` call or registration
   (core `f977ad62`).
9. **Two calls whose callee has no name shared a placeholder** (`{getA()(n)} and {getB()(n)}`).
   Such a call is never the same as another (core `f977ad62`, vector row
   `call-unspellable-callee-twice`).
10. **A block's registered content carried its values and its nested hosts' content**
    (`<!--ls:name-->Ana<!--/ls-->`, the cart's count), though its tokens held placeholders. The core
    writes each marked value as its `{NAME}`, the marker removed, and keeps a nested phrase or block
    host empty (core `11102878`, the marker removed at `4763906`); `_dev_/e2e/var.mjs` and
    block-content.test.ts read what is stored.
11. **In an async template, a `$t` template literal stopped following the locale after an `await` in
    an argument.** The rewritten call read the store after its arguments; it reads it first, as the
    call does.
12. **A key written beside a computed key was not a taken name**: `` $t(`Hello ${name}`, { [k]: 1,
    name: 'Zed' }) `` registered `Hello {name}` and dropped `name`. Every key an object literal
    argument writes is taken, so it registers `Hello {name_2}`, as without the computed key, and
    so is one behind a TypeScript cast.
13. **A value inside a `<DontTranslate>` within a `<Phrase>` registered one phrase per value**
    (`Signed in as {m0o}Ana{m0c} today`): the phrase held its `<DontTranslate>` text as written.
    The core keys an author's exclusion in a phrase as one empty markup pair whatever it holds
    (`4763906`), and the transform marks a value there as any other, so a block stores it as its
    `{NAME}`. Nothing inside a `<DontTranslate>` is read as a unit: a `<Translate>` or `<Phrase>`
    there registers nothing, in a block, in a block that falls back, or outside any block.
14. **A unit read on its own inside a fallback block took no category**, so its catalog key
    depended on whether a sibling made the block fall back (`Plain {version}` under `''` beside an
    `{#each}`, under `DT` without one). It takes the category the block renders with, from a
    context the block provides under a key of the component instance that wrote both, unless it
    names one.
15. **A write session that rendered a block in the base locale and then switched locale kept it as
    source**, though the catalog it fetched held the translation and the host was stamped resolved
    (`/fixture/var/category` with a write key: `alt="Picture of Ana"`). The registration sent in
    the base locale answered after the switch's catalog was published, and the core recorded the
    block as known with no entries over the fetched one; it marks only what the current catalog
    lacks (core `8db93c2`, in `4763906`). `_dev_/e2e/var.mjs` runs the flow on a read key and on a
    write key.
16. **A unit whose one token sat beside a `<DontTranslate>` at a paragraph's edge lost the space
    between them** (`Built withKangen`, served and in the browser): the core wrote the token over
    the whole text node. It keeps the node's own whitespace at each end, on the tree path and the
    DOM class (core `145df09`); dont-translate.test.ts and `_dev_/e2e/var.mjs` check both.
17. **An author's own exclusion was read as ordinary markup, and what an exclusion held changed a
    key.** `<span translate="no"><img alt="By {y}"></span>` served `alt="By {y}"` as written, since
    the core leaves an excluded subtree alone, and a `<Phrase>` inside such an element registered;
    an excluded `{owner.name}` renamed the phrase's own `{user.name}` to `{user_name}`; and an
    unnameable value inside a `<DontTranslate>` drew advice to write `%name%`, which a block shows
    as written there. The build reads such an element as a `<DontTranslate>`, through the core's
    `isTranslationExcluded`, names an excluded value after the unit's own, and warns only for
    values in a key. A snippet the module script exports could not render a top-level snippet
    holding a fallback block: that block's key was declared in the instance script. It is declared
    in the module script, for every snippet an exported one renders.
18. **A unit inside an element whose exclusion an expression decides, or inside a `<svelte:element>`
    that excludes itself, was read**, outside any block, and served translated inside the excluded
    element (`<span translate={mode}><Phrase>Top {x}</Phrase></span>`). The build reads neither.
    An expression `translate` inside an exclusion made its block fall back, though the element is
    excluded either way; it no longer does. A snippet parameter or a property named like a
    top-level snippet put that snippet's keys in the module script, shared by every instance.
19. **A snippet an exported one reached through a parameter's default value, or rendered beside a
    typed parameter of its name, kept its keys in the instance script, and the component did not
    compile** (`{#snippet a(row = helper)}`, `{#snippet c(r: Row)}{@render Row()}`): the parameter
    list was read whole as names it binds. Only the names a parameter binds hide a snippet; default
    values are read as renders. An element excluded as written but carrying an expression in its
    other attribute (`translate="no" data-notrans={flag}`) made its block fall back; it is excluded.
20. **A `<Phrase>` nested in a block keyed differently from the same phrase standing alone**
    (`By {owner_name}` beside the block's `Hi {user_name}`, `By {name}` alone): a block handed
    the core one params map for its whole tree, so every value in it was named in one space. The
    core renders a nested host with params of its own (core `d864c56`, in `4d6f0b79`), and the
    transform names each nested unit's values on their own.
21. **A top-level snippet named only in a type was read as rendered** (`id<typeof lone>(x)`,
    `(a: typeof lone): typeof lone => a`): type arguments and return types were walked as values,
    so the snippet's keys moved to the module script, one key shared by every instance. Every
    TypeScript type node is skipped now; only the expression wrappers (`as`, `satisfies`, `!`,
    `<T>`, an instantiation) are walked. An exclusion a spread applies (`<div {...attrs}>` with
    `translate: 'no'`) is decided at runtime, out of the build's sight: a unit inside it registers,
    and README.md says so.
22. **Three values shown as raw placeholders** (`{nick}`, `title="Profile of {name}"`) and one
    taken by the caller's params: a nested unit's own params skipped the normalisation a unit's
    get, so a value left unset rendered `For {nick}` where standing alone it rendered `For `; inside
    a `<Phrase>` an attribute mixing text and a value became a placeholder, which the core copies as
    it is; a `%name%` written in a block's `title` was not taken, so the caller's `name` replaced
    the user's. A nested unit's params are taken as a unit's, a phrase's attributes carry their
    values, and a name written in an attribute a translator reads is taken.
23. **A button's label read as data** (`<input type="submit" value="Send to {user.name}">`,
    `<button value="To %name%">`): the transform's attributes were the core's translatable list,
    which leaves out `value`, a label the core reads on a button and a submit or button input. A
    value in it went beside the tree, so the block registered `Hello` alone and the label was never
    translated, and a `%name%` there was not taken. Such a `value` is read as the core reads it.
24. **A name written in an attribute inside an exclusion, or a phrase, renamed nothing**
    (`<p translate="no" title="To %name%">` beside `Hello {user.name}`): the caller's `name`
    replaced the user's value, `Hello NICK`, where the same `%name%` in the exclusion's text kept
    it. A name written anywhere in a unit is taken, its own host's `class` included, so a unit keys
    the same standing alone and nested. An attribute written without a value
    (`<input type="submit" value>`) was served as `value="true"`; it is served empty, and a boolean
    one present.
25. **A name written in a `$t` template literal's text renamed nothing**
    (``$t(`Write to %name%, ${user.name}`, extra)``, and the same with `{name}`): the template's own
    value was named `name`, so it filled both places and the caller's `name` was lost, `Write to
    Ana, Ana`. A name written there, as `%name%`, `{name}` or an ICU argument, is taken, as in a
    unit: the template's value is `{user_name}`, and the caller's params fill the written one.

## Gaps, ranked by cost

1. **VAR-4** — the transform emits markers the core reads at `a5954a3c`, which is not released.
   The binding's release must require the core release that carries the reader (release-wave
   item below).

## Status

| Rule | Status | Tier | Evidence |
|---|---|---|---|
| GATE-1 | delegated | - | core row GATE-1 (implemented, contract) · probe `/write_enabled/` binding 0, core 12 · corroborated through the binding, live: E2E TEST 2 read → false, ip_write → true, write → true; TEST 13 painted value equals the authorize-project body |
| GATE-2 | delegated | - | core row GATE-2 (implemented, contract) · probe `/applyWriteEnabled\|canWrite/` binding 0, core 8 · the binding's `writeEnabled` wrapper keeps unknown as `undefined`, never `false` (stores.test.ts) — surfacing, not a lane decision |
| GATE-3 | delegated | - | core row GATE-3 (implemented, n/a (pure)) · probe `/localStorage\|sessionStorage\|setWriteEnabled/` binding 0, core 6 · the one module-level flag here, `pastHydration` (stores.ts), records hydration timing, not the decision. The GATE-3 carve-out is not taken |
| GATE-4 | delegated | - | core row GATE-4 (implemented, n/a (pure)) · probe `/persistScoped\|catalogCache/` binding 0, core 7 |
| GATE-5 | delegated | - | core row GATE-5 (implemented, contract) · probe `/updateTokens/` binding 0, core 7 |
| GATE-6 | delegated | - | core row GATE-6 (implemented, contract) · probe `/recordMissForDiscovery/` binding 0, core 5 |
| GATE-7 | delegated | - | core row GATE-7 (implemented, contract) · probe `/registerContentBlock/` binding 0, core 11 · every detecting path here is the core's: `$t` is the core signal, `<Translate>` and `<Phrase>` construct core handlers. Documented edge: under `'client'`, content rendered only during SSR feeds neither lane — SSR-1's required non-collection, stated in both READMEs |
| GATE-8 | delegated | - | core row GATE-8 (implemented, contract) · probe `/key_type/` binding 0, core 20 · the tri-state is surfaced unchanged; stores.test.ts "never substitutes false for not known yet" |
| GATE-9 | delegated | - | core row GATE-9 (implemented, contract) · probe `/discoveryBaseLocaleOnly/` binding 0, core 8 |
| GATE-10 | implemented | contract | `_dev_/contract/verify-contract.mjs` against `contract-fixture/` (tree `39ecf129`), a writer session in a real browser, asserting the double's accepted state. The fixture compiles with the transform, the path a Svelte block registers through, and the core walks up from the host this binding hands `registerBlock`, so each case sits in a different ancestor shape: `data-ls-resolved="it-it"` on the parent, the `data-langsys-resolved` spelling, a bare attribute three ancestors up, and a `<Phrase>` inside a resolved subtree all register nothing; `="false"` on a nearer ancestor opts back out and registers. Controls: an unmarked `<Translate>` and an unmarked `<Phrase>` register, so the double accepted this session's writes; and a bare `$t()` under a resolved ancestor registers, because `t()` is not a DOM reader (GATE-9 governs it). Identity untouched: the resolved block's `data-ls-contentblock` equals the id the core tokenizer re-derives from the host. Mutations: `<Translate>` handing the core a detached copy of its host reds 4; the same for `<Phrase>` reds 1. The reading itself is the core's (core row GATE-10 (implemented, n/a (pure)))  Tree path, mutation: `registerBlock` handed a detached copy of the host reds 4 contract (three resolved `<Translate>` shapes and the resolved `<Phrase>` register) |
| CAT-1 | delegated | - | core row CAT-1 (implemented, n/a (pure)) · probe `/buildTFn\|missingToken/` binding 0, core 38 · `t` is the core's signal by identity (surface.test.ts), so no lookup runs here |
| CAT-2 | delegated | - | core row CAT-2 (implemented, n/a (pure)) · probe `/\blookup\(/` binding 0, core 14 |
| CAT-3 | delegated | - | core row CAT-3 (implemented, n/a (pure)) · probe `/isContentBlockKnown/` binding 0, core 10 |
| REG-1 | delegated | - | core row REG-1 (implemented, n/a (pure)) · probe `/canWrite/` binding 0, core 3 |
| REG-2 | delegated | - | core row REG-2 (implemented, n/a (pure)) · probe `/debounceTimer\|scheduleTokenFlush/` binding 0, core 10 |
| REG-3 | delegated | - | core row REG-3 (implemented, n/a (pure)) · probe `/flushOnTeardown/` binding 0, core 4 |
| REG-4 | delegated | - | core row REG-4 (implemented, n/a (pure)) · probe `/keepalive\|sendBeacon/` binding 0, core 7 |
| REG-5 | delegated | - | core row REG-5 (implemented, n/a (pure)) · probe `/installTeardownFlush\|visibilitychange\|pagehide/` binding 0, core 4 |
| REG-6 | delegated | - | core row REG-6 (implemented, n/a (pure)) · probe `/\[\.\.\.this\.missingTokens\]/` binding 0, core 2 |
| REG-7 | delegated | - | core row REG-7 (implemented, n/a (pure)) · probe `/updateInFlight\|registrationsInFlight/` binding 0, core 8 · one registration request in flight per block is the core's `registerBlock`, which both components call on every `t` change |
| REG-8 | delegated | - | core row REG-8 (implemented, contract) · probe `/consecutiveFailures\|retryNotBefore/` binding 0, core 10 |
| REG-9 | delegated | - | core row REG-9 (implemented, contract) · probe `/batch_limit/` binding 0, core 2 |
| REG-10 | delegated | - | core row REG-10 (implemented, contract) · probe `/noteSendFailure\|createTranslatableItems/` binding 0, core 7 |
| REG-11 | delegated | - | core row REG-11 (implemented, n/a (pure)) · probe `/warnedEllipsis/` binding 0, core 3 |
| REG-12 | delegated | - | core row REG-12 (implemented, n/a (pure)) · probe `/missingToken/` binding 0, core 33 |
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
| ICU-2 | delegated | - | core row ICU-2 (implemented, n/a (pure)) · probe `/\binterpolate\(/` binding 0, core 12 |
| ICU-3 | delegated | - | core row ICU-3 (implemented, n/a (pure)) · probe `/_recoverMissingArgs/` binding 0, core 6 |
| ICU-4 | delegated | - | core row ICU-4 (implemented, n/a (pure)) · probe `/noteDefaultedArgs/` binding 0, core 2 |
| ICU-5 | delegated | - | core row ICU-5 (implemented, n/a (pure)) · probe `/isICU\|X-Langsys-Capabilities/` binding 0, core 12 · the binding makes no request of its own: every catalog request the browser makes through it carries `X-Langsys-Capabilities: icu`, the core's header (`_dev_/e2e/var.mjs`, a locale switched in the browser) |
| ICU-6 | delegated | - | core row ICU-6 (implemented, n/a (pure)) · probe `/noteFormatterFailure/` binding 0, core 2 |
| CID-1 | delegated | - | core row CID-1 (implemented, n/a (pure)) · probe `/canonicalContentBlockJson/` binding 0, core 4 |
| CID-2 | delegated | - | core row CID-2 (implemented, n/a (pure)) · probe `/generateCustomId/` binding 0, core 13 · the testbed imports it to re-derive MARK-1; `src/routes` is not the binding and does not ship |
| CID-3 | delegated | - | core row CID-3 (implemented, n/a (pure)) · probe `/generateLegacyCustomId/` binding 0, core 5 · "JS and its bindings: call the exported functions; do not reimplement them" — nothing here hashes |
| CID-4 | delegated | - | core row CID-4 (implemented, n/a (pure)) · probe `/legacyTokenizeElement/` binding 0, core 4 |
| TOK-1 | implemented | n/a (pure) | In a `<Phrase>` an author's exclusion — a `<DontTranslate>`, a `translate="no"` or `data-notrans` element — is one empty markup pair whatever it holds. 12 of the 13 phrase rows of the shared fixture (`vectors/canonicalization-reference.json`, blob `525afacd`), written as the body of a `<Phrase>` with each marked value a Svelte variable, register their key or nothing: literal, marked and mixed content under both attributes, a `%name%` inside, the slot after an excluded element, the `data-notrans="false"` control, and a phrase of only excluded content, which registers nothing; a translation filed under a row's earlier key renders, and only the current key registers (canonicalization.test.ts). The `<script>` row is a fallback here, as the test asserts: raw text in markup. Through the binding's own `<DontTranslate>`, in a request scope: `Signed in as {m0o}{m0c} today` with the value shown on the page, a translation's text inside the pair replaced by the element's own content (`Connesso come {m0o}XXX{m0c} oggi` serves `a@b.c`), and a translation under the earlier key `Welcome to {m0o}Langsys{m0c}, {m1o}friend{m1c}` served in Italian (dont-translate.test.ts). In a block nothing inside a `<DontTranslate>` produces a token, and a unit whose one token sits beside one at a paragraph's edge keeps its text node's own space between them, as source and translated (`Built with Kangen`, `Costruito con Kangen`; dont-translate.test.ts), served in Italian, in the base locale in the browser, after hydration, rendered by the client alone, and without the transform on the core's DOM class (`_dev_/e2e/var.mjs`, 5 checks); control, against core `4763906` all six fail (`Built withKangen`). The build reads an author's `translate="no"` or `data-notrans` element as a `<DontTranslate>`, by the core's own `isTranslationExcluded`, from its `/pure` entry: an attribute's text inside one is a value, served as `alt="By a@b.c"` and stored with no value (dont-translate.test.ts), no unit inside it is read, nor inside an element whose `translate` or `data-notrans` an expression decides, nor inside a `<svelte:element>` that excludes itself; `data-notrans="false"` is the control, attribute names match whatever their case, and such an attribute decided at runtime makes a block a fallback, unless the element is already inside an exclusion or its other attribute, as written, excludes it, an attribute's text there then a value (preprocess.test.ts). The build reads an exclusion written on the element itself: one a spread applies, or another component applies to its own elements, is decided at runtime where the build cannot see it, and a unit inside it is read and registers (README.md). What an exclusion holds changes no key: a value inside one is named after the unit's own values, so `Hi {user.name}, as <DontTranslate>{owner.name}</DontTranslate>` registers `Hi {name}, as {m0o}{m0c}` (VAR-2; preprocess.test.ts, dont-translate.test.ts). The tag exclusions (`<script>`, `<style>`, `<template>`, `<noscript>`, `<math>`) are core row TOK-1 (implemented, n/a (pure)): `<Translate>` hands its host to the core `Translate` class, which does the walking. Mutations: `<DontTranslate>` emitted without `translate="no"` reds 11 unit; an author's exclusion read as ordinary markup, 3 unit; one an attribute decides at runtime read as none, 1 unit; a unit inside an exclusion an expression decides read, 1 unit; a `<svelte:element>` excluding itself not seen, 1 unit; an expression attribute inside an exclusion making the block fall back, 1 unit; attribute names matched by case, 1 unit; an expression attribute deciding before an exclusion written in the other, 1 unit; that written exclusion read as ordinary, 1 unit |
| TOK-2 | delegated | - | core row TOK-2 (implemented, n/a (pure)) · probe `/normalizeTokenText/` binding 0, core 29 |
| TOK-3 | delegated | - | core row TOK-3 (implemented, n/a (pure)) · probe `/aria-roledescription/` binding 0, core 1 |
| TOK-4 | delegated | - | core row TOK-4 (implemented, n/a (pure)) · probe `/translateAttribute/` binding 0, core 8 |
| TOK-5 | delegated | - | core row TOK-5 (implemented, n/a (pure)) · probe `/normalizeMarkupPlaceholders\|adoptPercentPlaceholders/` binding 0, core 28 · `%name%` is this binding's explicit markup form, since in Svelte markup `{name}` is an expression: E2E TEST 12 renders it through `<Translate>` and `<Phrase>`; with the transform, `{name}` is a variable, and the fixture's `brace-name-in-markup` row built that way lands on the same id (canonicalization.test.ts) |
| TOK-6 | delegated | - | core row TOK-6 (implemented, n/a (pure)) · probe `/usesSingleTextNodeFastPath/` binding 0, core 8 |
| MARK-1 | implemented | n/a (pure) | Tree path: the served host carries `data-ls-contentblock` equal to the id derived independently from the phrase's tokens (`generateCustomId('VAR', ['Hello {name}, welcome back'])`, var-served.test.ts), and 35 rows of the shared canonicalization fixture built through the transform derive the ids a DOM reader derives (canonicalization.test.ts). Fallback path: an app-supplied `custom_id` is stamped on the served host under the core's attribute (served-bytes.test.ts). Browser: `<Phrase>` carries the core's own `PHRASE_MARKER_ATTR` (E2E TEST 13, bogus-marker control; served bytes); a vanilla `<Translate>` host's stamp equals the id the core tokenizer re-derives (E2E TEST 15, GATE-10 contract case). Mutations: the tree host without its `hostAttrs` reds 1 (var-served.test.ts) and 1 VAR (the stamp); removing the fallback `custom_id` stamp reds 1; removing `<Phrase>`'s marker reds 1 |
| MARK-2 | delegated | - | core row MARK-2 (implemented, n/a (pure)) · probe `/PHRASE_MARKER_ATTR_LEGACY\|isPhraseMarked/` binding 0, core 14 · this binding writes one spelling and reads none |
| MARK-3 | delegated | - | core row MARK-3 (implemented, n/a (pure)) · probe `/isContentBlockMarked/` binding 0, core 5 |
| MARK-4 | delegated | - | core row MARK-4 (implemented, n/a (pure)) · probe `/_walkForTokens/` binding 0, core 7 · Through the binding: a readable block inside a fallback block is a unit of its own after hydration too, because the core's `registerBlock` claims the host the binding renders and the fallback's walk leaves it alone (`_dev_/e2e/var.mjs`: the nested block's `alt` stays `Foto di Ana`; control, the same check against core `e1c39e78`, which does not claim the host, reads `Foto di {name}`). The transform emits a nested `<Translate>` or `<Phrase>` as its marked element, so the content the outer block registers keeps that element and none of its text or values (block-content.test.ts, in a request scope; control: an element opted out with `data-ls-contentblock="false"` is the outer block's content, and its text is there; against core `f977ad62` the outer content held the nested text and `Ana`). Mutation: the nested host emitted without its marker reds 11 unit |
| VAR-1 | implemented | contract | `_dev_/e2e/var.mjs` through SvelteKit against `contract-fixture/`: two users, Ana and Luis, on the transformed route register the one phrase `Hello {name}, welcome back`, and no registered text carries either name; a server render alone registers it after the response. A block's registered content holds each marked value as its `{NAME}`: the count's block from the server's flush and a block only the browser renders, mounted before `init()` has answered, as the double stores them (`var.mjs`; against core `f977ad62` the stored content held `3` and `Ana`), and the outer and nested blocks a request scope sends (block-content.test.ts). Nothing a request scope sends carries a value placed inside a `<DontTranslate>`: a phrase keys the element as one empty markup pair, and a block stores the value as its `{NAME}` (dont-translate.test.ts, TOK-1, VAR-3). Each render passes its own value: var-served.test.ts serves `Ciao Ana, bentornato` and `Ciao Luis, bentornato` from one catalog entry. Mutation: the value emitted as text instead of the marker pair reds 44 unit and 13 VAR (per-user tokens, no catalog hit, no placeholder phrase, nothing served translated, a value in the registered content) |
| VAR-2 | implemented | n/a (pure) | Names are the core's `derivePlaceholderNames` (core row VAR-2 (implemented, n/a (pure))); this binding maps Svelte's AST onto the vectors' shape. naming.test.ts runs all 32 rows of `vectors/var-naming-vectors.json` (blob `0513e1cb`), each asserting the shape Svelte's parser yields for the row's source and the names the row expects; plus a store read, optional chaining, TypeScript assertions (`!`, `as`, `<T>`) and a nested call. `%name%` written in a unit, a `%name%`, `{name}` or ICU argument written in a `$t` template literal's text (there the caller's params fill it, and the template's own value takes another name), literal `params` keys and every key an object literal argument to a `$t` template literal writes, whatever else the object holds and through a TypeScript `as`, `satisfies`, `!` or `<T>`, are handed to the core as taken names. Every occurrence goes to the core in source order, and the binding merges none by its source: an expression that names itself is one placeholder wherever it repeats (`{name}, {a.b} … {name} {a . b}` → `{name}` and `{b}` twice), and one that cannot be named is a placeholder of its own each time (`{a + b} and {a + b}` → `{value} and {value_2}`, two build warnings), as is each of two unnameable values of one shape (`{a + b} {c * d}` → `value`, `value_2`), and a call whose callee has no name is never the same as another (`{getA()(n)} and {getB()(n)}` → `{n}` and `{n_2}`; preprocess.test.ts, naming.test.ts). A value inside an author's exclusion is in no key (TOK-1), so the unit's own values are named without it: it takes the name of the same expression among them, the core's call, or a name they leave free (`Hi {user.name}` beside an excluded `{owner.name}` keeps `{name}`, the excluded value is `{owner_name}`), and an unnameable one there is named with no build warning; distinct values always get distinct names, an excluded `{name}` beside `{user.name}` giving `name` and `name_2`, two excluded `{a.name}` and `{b.name}` `a_name` and `b_name` (preprocess.test.ts). A name written inside an exclusion (`%name%`) is taken like any written name: on the phrase path the caller's params fill it, so `Hey {user.name}, write to <b translate="no">%name%</b>` with non-literal params registers `Hey {user_name}, write to {m0o}{m0c}`, its own value the user's `Ana` in every render, and the caller's `NICK` filling the exclusion, translated and as source. In a block it stays as written (dont-translate.test.ts). A `<Translate>` or `<Phrase>` nested in a block names its own values and renders with its own params, carried on its host's tree node, so `<Phrase>By {owner.name}</Phrase>` registers `By {name}` inside a block as standing alone and each unit shows its own value, translated or not, a value it leaves unset empty as standing alone; inside a phrase a nested block is part of the phrase (preprocess.test.ts, block-content.test.ts). A `%name%` written anywhere in a unit, in its text or in any attribute, its own host's `class` included, beside a value, inside an exclusion or in a phrase, is taken, so the caller's params never replace the unit's own value; a button's or a submit or button input's `value` is an attribute a translator reads, as the core reads it (preprocess.test.ts). Through SvelteKit, `{items.length}` registers as `You have {items_count} items` (var.mjs). Mutations: names not taken from the core red 99 unit (every vector row) and 21 VAR; merging repeated expressions by their source reds 5 unit (the repeat rows, through the vectors and the build); a value inside an exclusion named among the unit's own, 4 unit; an unnameable one there warned about, 1 unit; an excluded value kept when it changes an own name, 1 unit; one kept under a name no own value has, 1 unit; a name written inside an exclusion not taken, 1 unit; a unit nested in a block not made, 7 unit; one not handed its own params, 5 unit; a unit made of a block nested inside a phrase, 2 unit; a nested unit numbering its values from zero, 1 unit; a name written in a `$t` template literal's text not taken, 1 unit; one written there as `{name}` not taken, 1 unit |
| VAR-3 | implemented | n/a (pure) | Emitting: the transform writes the tree form, `{comment: 'ls:NAME'}`, the value, `{comment: '/ls'}`, with the typed value also in `params` so the caller's value wins, inside a `<DontTranslate>` as anywhere else, and never `%name%` there (preprocess.test.ts). Reading: core row VAR-3 (implemented, n/a (pure)). The emitted trees agree with a DOM reader on the shared fixture (`vectors/canonicalization-reference.json`, blob `525afacd`, canonicalization.test.ts): the five value rows written as Svelte variables (one marker, two markers, marker-only, a marker alone in a slot, `{name}` in markup) reach each row's tokens and id, as do the 27 plain rows, and the four the build declines (`<math>`, `<svg>`, `<style>`, `<script>`) are fallbacks. The three stored-content rows the build expresses, a run, a value alone in a slot and a value inside an author's `translate="no"` element, register the row's content byte for byte: each value its `{NAME}` text, no marker. The double stores such content through SvelteKit (`_dev_/e2e/var.mjs`), and a request scope sends it for nested blocks (block-content.test.ts) for a value inside a `<DontTranslate>` (dont-translate.test.ts), and for a `%name%` written by hand, stored as `{name}` in the text and in an attribute as a marked value is (block-content.test.ts). The attribute form, voided pairs and bad names are reader-only rows this build never emits. Measured, and as specified: an `{#if}` inside a block's `<DontTranslate>` registers one block whichever branch it shows, the same tokens and id, its content differing only inside the excluded element (`{email}` or `none`; dont-translate.test.ts). The rule asks every core to store the same string for the same host in one registration; stored content is the server's last write and what the Translation Manager shows, never what a translator translates. Mutations: a value inside a `<DontTranslate>` dropped reds 12 unit; written as `%value%`, 12 unit |
| VAR-4 | partial | n/a (pure) | This binding emits (VAR-6); its reader is the core's, core row VAR-3 (implemented, n/a (pure)) at `a5954a3c`, and core row VAR-4 (implemented, n/a (pure)). That core is not released, and `dependencies.langsys-js-typescript` is still `^0.6.4`: the release of this binding must require the core release carrying the reader (Release-wave items) |
| VAR-5 | n/a (profile: server) | - | Profiles: server. This is a browser binding, and it cannot fail a rule about what a server emits. core row VAR-5 (n/a (profile: server)) |
| VAR-6 | implemented | contract | `langsys-js-svelte/preprocess`, one line in `svelte.config.js` (README.md); `_dev_/preprocess-entry.mjs` imports the published entry from the packaged `dist/` and transforms and compiles a component, 4/4. The rule's Test through SvelteKit (`_dev_/e2e/var.mjs`): a component interpolating a user's name inside `<Translate>` registers one phrase with the placeholder across two users, and each placeholder is named per the vectors (VAR-2). Rewrites `<Translate>` and `<Phrase>` content and `` $t(`…`) `` template literals; `{#if}`/`{#key}` branches, handlers, attributes and nested `<Phrase>`/`<Translate>`/`<DontTranslate>` are read, an attribute's value inside a phrase carried beside the tree and shown, never a placeholder, since the core copies a phrase's attributes as they are (block-content.test.ts), a submit input's label registered with its value as a placeholder and served translated (block-content.test.ts), an `<input>` whose `type` an expression decides beside a `value` holding text a fallback, and anything else is a named fallback (preprocess.test.ts, 42). A `{value}` inside a `<DontTranslate>` is marked as any other, in a phrase and in a block, and the build writes no `%name%` for it (preprocess.test.ts); the core keys the element in a phrase as one empty markup pair and stores a block's value there as its `{NAME}` (TOK-1, VAR-3). Inside a `<DontTranslate>` nothing is read as a unit, a nested `<Phrase>` included. In a request scope nothing sent, phrases or blocks, carries such a value, while the rest registers (dont-translate.test.ts; control: the same value outside the `<DontTranslate>` is the phrase's placeholder, `Hello {email}`). A readable block inside a fallback block is transformed as a block of its own, under the category the fallback block renders with unless it names one, as it would be were the block read: the block provides it as a context under a key that is an object of the component instance (of the module script for a snippet the module exports, or a top-level snippet one renders, however deep, which has no instance; a name a snippet's own parameters bind hides a top-level snippet of that name, at any depth of a pattern, their default values, a computed key in a pattern and a computed member count as renders of one, and neither a property nor a type does, in an annotation, a return type or type arguments), named so that no name in the file meets it, so it is the value the block got, computed, spread or text, and a unit takes the block it is written in, in the instance that wrote it, whatever renders around it: another component's fallback block, or another instance of its own. A spread after a category written as text decides it at runtime, so a nested unit naming its own is read on its own, in a block that is read as in one that falls back (preprocess.test.ts; served translated, var-served.test.ts; in a request scope, fallback-category.test.ts and dont-translate.test.ts; in the browser, `_dev_/e2e/var.mjs`: served and hydrated, rendered by the client alone after a locale switch, and following the block's category when it changes). A `<Translate>` or `<Phrase>` inside a `<DontTranslate>`, or inside an author's `translate="no"` or `data-notrans` element, or one an expression may exclude, is never read and registers nothing: in a block it is part of that `<DontTranslate>`'s content; in a fallback or outside any block the build marks it, and any unit inside it, with a warning (preprocess.test.ts; dont-translate.test.ts). A `$t` template literal keeps the core's argument order: an object second argument, `null` included, is the params, a string literal the category, and anything else, spread and comma arguments and computed keys included, is decided when the call runs, as the core decides it; the store is read first, then the template's own values, then the other arguments, as the call reads them, so in an async template an `await` in an argument leaves the text following the locale; the template's own values win over params of the same name, and the other arguments reach the core as written, an `await` in them included; a parenthesised `$t` is the same call (preprocess.test.ts, with the arguments the core's `t` receives and the order it reads them in). Optional: without it the package works unchanged apart from VAR-7 |
| VAR-7 | implemented | contract | `_dev_/e2e/var.mjs`: `/fixture/var-plain`, the same block without the transform, visited by two users, registers neither name, beside the transformed route registering in the same run through the same double; on the transformed route an `{#each}` block mounted at first paint (a fallback) registers nothing. The notice fires and names the transform (debug). A catalogued translation still renders on the plain route. On the server a block without a tree never calls `registerBlock`. Raw HTML is content: a block whose only dynamic part is `{@html}` registers its HTML's text (`From the CMS, section one`), and one that also interpolates a variable registers nothing (var.mjs; preprocess.test.ts). This binding sees raw HTML through the transform, which is where the rule places the carve-out for Svelte; without it the runtime cannot tell an `{@html}` block from an interpolating one, and the block stays under the rule's first clause — var.mjs records it registering nothing, as a measurement. Mutations: the vanilla path always registering reds 6 VAR (a per-user phrase, a value in a block's registered content, the `{#each}` fallback, the mixed `{@html}` block, the `{#await}` block, the plain route) and 2 credentials; removing the notice reds 1 VAR; the `{@html}`-only block not registering reds 1 VAR |
| SSR-1 | delegated | - | core row SSR-1 (implemented, n/a (pure)) · probe `/shouldQueueForWrite/` binding 0, core 2 · both READMEs state that `'client'` collects nothing server-side |
| SSR-2 | delegated | - | core row SSR-2 (implemented, n/a (pure)) · probe `/ssrWriteEnabled/` binding 0, core 4 · corroborated through the binding by the two-case `/e2e/ssr-write` procedure (a valid grant degrades `'server'` and registers 0; no grant registers 2), run per case on a fresh server and not among this revision\'s runs |
| SSR-3 | implemented | n/a (pure) | src/docs.test.ts: README.md and README-SSR.md, both shipped, each carry an `[!IMPORTANT]` callout that leads with the allow-list precondition. Controls: the parser finds README-SSR's known `[!WARNING]` and rejects README.md's plain discovery-gap blockquote, which mentions the allow-list in passing. Demoting the callout to a blockquote reds 1. The refused side belongs to the core and the backend |
| SRV-1 | implemented | contract | Served bytes, through `createLangsysHandle` and the catalog the core fetches from `contract-fixture/` (`_dev_/e2e/var.mjs`): a transformed `<Translate>` serves `Ciao Ana, bentornato` for `it-it`, and the ICU plural the catalog holds for 1 and for 5; no source text is left in the page. In process (var-served.test.ts): for Ana and for Luis; an `{#if}` branch as the branch that renders; control, an empty catalog serves the source with the value in place. A translated `<Phrase>` host is served with `data-ls-resolved` for the request locale, and an untranslated one without it (var-served.test.ts). An attribute written without a value is served empty, as Svelte's own markup writes it, and a boolean one present (block-content.test.ts). `$t()` serves the request locale inside the scope (0 of 800 wrong under concurrency with an await before the read, `_dev_/e2e/srv-scope.mjs`) and the base language for a miss (served-bytes.test.ts). The sanctioned fallback: a block the transform cannot read, or any block without it, is served as source with an app-supplied `custom_id` stamped and no resolved marker (served-bytes.test.ts, the `fallback:` rows; srv-capture.test.ts for `{#await}`), and the core's `warnUnrenderedBlock` fires once per process per reason, on the server only, at debug level — `variable` for a block that registers nothing, `raw-html` for raw-HTML content the client registers (unrendered-notice.test.ts: 50 renders, one notice after a real `init({ debug: true })`; control, a window present, none). Mutations: the tree host rendered without `hostAttrs` reds 1 unit and 1 VAR; removing the server `warnUnrenderedBlock` call reds 1; dropping its server-only guard reds 2 |
| SRV-2 | implemented | contract | Each request renders in its own scope (SRV-7), and every store this binding exports reads it: with the process seeded German and the render inside an Italian scope, `$t` / `$currentlyLoadedLocale` / `$sTranslations.SRVC.Pricing` serve `Prezzi` / `it-it` / `Prezzi`; control, no scope, `Preise` / `de-de` / `Preise` (src/ssr-measure/scope-stores.test.ts). The same render's `$serverMessage(…)` serves `Prezzi` and `LangsysApp.localeHeaders()` sends `it-it`; control, `Preise` / `de-de`. Under concurrency, 100 × 8 `it-it`/`de-de` renders awaiting before the read serve 0 of 800 wrong through `createLangsysHandle`, against 400 of 800 with no scope or with one scope shared by every request (`_dev_/e2e/srv-scope.mjs`). No process-global holds per-request state: every server render releases its store subscriptions, in a scope or not — 50 renders each, `tSignal` 100 opened / 100 released, `currentlyLoadedLocale` and `sTranslations` 50 / 50; control, a never-released subscription reads 50 open. Credentials: `createLangsysHandle`'s `credentials` hands each request its own project id and API key, and the core's scope sends under them (src/srv-scope/credentials.test.ts, against the contract double, which refuses a key for another project). Two concurrent requests, for projects one and two, and a third given none: each renders its own project's catalog, each project accepts only its own request's misses, and at the fetch seam every request for a project went out under that project's key and none under another's, the third under the key `init()` set; a read key renders under its own project and sends nothing after the response, while a write key's misses arrive; the page's seed carries no key. Mutation: the handle dropping the credentials reds 2 unit |
| SRV-3 | implemented | contract | `createLangsysHandle` closes each scope after the response, and the core's close sends the scope's misses only when the key may write. `_dev_/e2e/srv-flush.mjs` against `contract-fixture/`, whose POST /translatable-items is seeded to answer 3 s late, through the shipped helper with the SDK initialised on the server (`ssrTokenStrategy: 'server'`): a page rendering a missing phrase arrives in about 50 ms, the phrase is absent from the double's state when it arrives, and — write key — present once the flush lands. Read-only key: the phrase never arrives, with the write run as the control that the double accepts it. A server render outside a request scope registers nothing, since nothing would send it, and the block registers from the browser after hydration: with debug on, 50 such renders make no call the core reports as misplaced; controls, a direct `registerBlock` outside a scope is reported, and inside a scope the render's misses are recorded (src/ssr-measure/var/server-registration.test.ts). Mutations: the handle awaiting the close before returning makes the page take 3 s and the phrase already registered on arrival — 2 red; a server render registering outside a scope — 2 unit (server-registration.test.ts: the core reports the call as misplaced, and its control finds the notice already said) |
| SRV-4 | implemented | n/a (pure) | The core's half is `seedCatalog`, synchronous (core row SRV-4 (implemented, n/a (pure))). The binding's half ships: `createLangsysHandle` writes the scope's seed into the page and `hydrateFromServer()` hands it to `seedCatalog` before hydration. `_dev_/e2e/srv-scope.mjs` in a real browser: the hydrated page keeps the served Italian with no hydration warning; control, the same page without the seed (`?noseed=1`), re-renders to `Pricing`. `hydrateFromServer()` passes the whole seed, the blocks and phrases the server rendered with it, so the hydrated client sends none of them again: `_dev_/e2e/var.mjs` serves the captured page against an emptied double and finds nothing from it stored; control, a block rendered only in the browser is stored. Mutations: `hydrateFromServer` not seeding — 1 red; seeding the catalog without the rest — 1 VAR (the hydrated client resends a phrase the server collected) |
| SRV-5 | implemented | n/a (pure) | Inside the core's request scope, a depth-3 nested `<Translate>` built by the transform records each block exactly once per render — counts `[1, 1, 1]`, calls counted rather than a set — and what the flush sends names each miss once (srv-capture.test.ts). A placeholder never keys a block: the build tells a placeholder from content — `{#await}` is visible to it — and declines to capture it (preprocess.test.ts), so that block takes SRV-1's fallback: served as `Loading…`, no resolved marker, nothing thrown, and nothing registered from it (VAR-7). Through SvelteKit (`_dev_/e2e/var.mjs`), an `{#await}` resolving in 100 ms and in 2000 ms — either side of the core's 500 ms settle window — renders its content and registers neither the placeholder nor the content. Mutation: rendering each block twice per render reds 1 (the per-block count); no server `registerBlock` reds 27 unit (what the flush sends, the in-scope control, and what block-content.test.ts, dont-translate.test.ts and fallback-category.test.ts read) and 3 VAR (SRV-3) |
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
| BIND-1 | implemented | n/a (pure) | Adaptation is confined to Svelte's model: `Writable` → `Signal` (adapters.ts), a store form of `writeGrant` resolved per call, the hydration timing guard (stores.ts), a `serverMessage` store derived from `t`, and `syncNavigation()`, which only times the core's entry point. stores.test.ts; live, E2E TEST 1: the safe store reads `undefined` while the raw signal is `true` at hydration, console clean. A one-shot read (`get(writeEnabled)`) is the live value from the macrotask after a component first renders the store (stores.test.ts; in that render's own task, where the first page's `onMount` runs, it is still `undefined`), or after `syncNavigation()` has seen the first page mount (kit.test.ts; control, without the mount it stays `undefined`); one made earlier, as in a universal `load`, is `undefined` and leaves the hydration render its `undefined` (stores.test.ts). Disabling the deferral reds 7 (stores.test.ts, kit.test.ts); a one-shot read ending the pass reds 1 (stores.test.ts); `syncNavigation()` not ending it reds 1 (kit.test.ts) |
| BIND-2 | implemented | n/a (pure) | Artifact inspection with a control: own-rule probe `/write_enabled\|key_type\|auto_discovery\|autoDiscovery/` binding 0, core 45 (`_dev_/delegation-probe.mjs`, comments stripped, tests excluded). `writeEnabled` is surfaced as a tri-state and nothing in `src/lib` reads it to decide anything |
| BIND-3 | implemented | n/a (pure) | Own-rule probe `/fetch\(\|XMLHttpRequest\|sendBeacon\|setInterval\|keepalive\|headers/` binding 0, core 15. Its timers schedule no request of their own: two `setTimeout(…, 0)` in stores.ts, the end of the hydration pass and each subscriber's hand-over, and one in `kit/server.ts` that closes a request scope after the response, whose send is the core's (SRV-3). `syncNavigation()` sends nothing |
| BIND-4 | implemented | n/a (pure) | src/lib/config-surface.test.ts: the Svelte config's keys equal the core config's in both directions — `messagesCategory` included — as a type enforced by `npm run check`; control: the same machinery detects an invented key. The binding changes two keys' types (`UserLocaleStore` takes a `Writable`, `writeGrant` also takes a store) and adds none. Adding `discovery?: boolean` gives 1 svelte-check error |
| BIND-5 | implemented | n/a (pure) | `t` is the core's signal (surface.test.ts, `toBe`), and `LangsysApp.t` is the core's current `TFunction`: accessor values pass through the proxy unbound (removing that reds 3). `serverMessage` derives a function from `t` and keeps nothing. Own-rule probe `/memo\|[Cc]ache\|new Map\(\|new WeakMap\(/` binding 0, core 15 |
| BIND-6 | implemented | n/a (pure) | BIND-6 v2. (1) Proxy-forward over the core singleton with an `Object.hasOwn` override set of exactly `init` and `setWriteGrant`, set-equal to `OVERRIDDEN_MEMBERS`; `t`, `currentlyLoadedLocale`, `sTranslations`, `LangsysAppAPI`, `canonicalizeLocale`, `notifyNavigation`, `resolveServerMessages` and `renderServerMessage` by reference (`toBe`). SvelteKit wiring lives in entries of its own so the main one never imports `$app/*` or a Node built-in: `./kit` (`syncNavigation`, `hydrateFromServer`) and `./kit/server` (`createLangsysHandle`), each only times or places a core operation. Two deliberate additions, each a Svelte idiom over a core value: `writeEnabled` (hydration-safe) and `serverMessage` (reactive). `syncNavigation` lives in `./kit` so the main entry never imports `$app/*`. Reachability is generated from the core prototype, not listed. (2) The exported type is `Omit<typeof core, …> & {…}`, so core-private members are absent; surface.test.ts core-PRIVATE rows plus `enumerate-core-surface.mjs --self-test`. (3) No test or doc presents a core-private name as API. (4) `this` is the core: functions are bound to the target with the target as receiver — proxy-receiver.test.ts, where a naive proxy fails first on a `#private` fixture. (5) Destructuring works (surface.test.ts). Accessor values are never bound, so `t` keeps its identity; removing that reds 3 |
| GRANT-1 | implemented | n/a (pure) | `writeGrant` takes a string, a provider (sync or async), or — Svelte only — a store, which `adaptWriteGrant` turns into a provider (adapters.test.ts). README.md leads with the store and tells integrators to prefer a store or provider over a string, which goes stale when the token expires. Mutation: passing the store through unadapted reds 4 |
| GRANT-2 | implemented | n/a (pure) | The store is read on every provider call, never at adapt time (adapters.test.ts). Live corroboration, E2E TEST 8: writing an expired token into the store degrades the next request, `true → false`, with no imperative call. Mutation: snapshotting the store at adapt time reds 3 |
| GRANT-3 | implemented | live | E2E TEST 16: READ key with no grant paints `false`; the binding's `setWriteGrant(valid)` paints `true`, and that value is the re-authorization response's `write_enabled`, not local state. TEST 3: the call issues an authorize-project request carrying `X-Write-Grant`. Mutation: an override that resolves without calling the core reds 5 (TEST 3 ×2, TEST 16 ×3) |
| GRANT-4 | implemented | live | E2E TEST 8: a valid store-form grant flips a READ key — the grant arm, not the key type — and `X-Write-Grant` survives the cross-origin preflight. TEST 9: self-minted valid accepted, expired and no-`exp` refused. TEST 16: misses rendered after the grant land in the catalog. The delayed short-TTL case is not run as a delay; the server receives it exactly as TEST 9's already-expired token. Mutation: `init` dropping `writeGrant` reds 3 (TEST 8 ×3) |
| CACHE-1 | delegated | - | core row CACHE-1 (implemented, n/a (pure)) · probe `/langsys:translations/` binding 0, core 2 · Through the binding, a locale switch overtaken by another stores each catalog under its own locale and shows the last one chosen (`_dev_/e2e/locale-race.mjs`, 4/4; on core `15e31041`, 0/4: the French catalog stored under `de-de`) |
| CACHE-2 | delegated | - | core row CACHE-2 (implemented, contract) · probe `/catalogUnavailable/` binding 0, core 15 · a catalog restored before authorization answers keeps serving when the fetch or the authorization is refused: the core's `init` restores it while authorization is in flight, and the binding's `init` override hands that call through |
| REF-1 | delegated | - | core row REF-1 (implemented, contract) · probe `/readReferenceList\|referenceLists/` binding 0, core 19 · the six list calls, `getLocales`, `getLocalesFlat`, `getLocalesData`, `getCurrencies`, `getCountries` and `getDialCodes`, reach the core through the proxy unchanged (BIND-6), and the binding holds and sends nothing of its own (BIND-3). src/srv-scope/reference-reads.test.ts, against the contract double, which names each list in its display locale: for each call, a list the core holds is answered through the binding with no request, with the double's tables reseeded so that a read would answer another list; a display locale not held goes out once, as the core's own read, and nothing else is sent. Through `createLangsysHandle`, a call with no locale names its list in the request's locale, not the store's (SRV-6), and a later request in that locale answers the held list with no request. Mutations: the binding reading a list itself reds 3 unit, holding a list of its own 7, the handle dropping the request's locale 3 |
| OBS-1 | delegated | - | core row OBS-1 (implemented, contract) · probe `/noticeUnusableWriteCapability/` binding 0, core 4 |
| WIRE-1 | delegated | - | core row WIRE-1 (implemented, n/a (pure)) · probe `/x-Authorization\|X-Authorization/` binding 0, core 1 |
| WIRE-2 | delegated | - | core row WIRE-2 (implemented, contract) · probe `/204/` binding 0, core 1 |
| WIRE-3 | delegated | - | core row WIRE-3 (implemented, contract) · probe `/toLowerCase\|getCanonicalLocales/` binding 0, core 47 · locale.test.ts pins the re-exported `canonicalizeLocale` producing lowercase |
| WIRE-4 | delegated | - | core row WIRE-4 (implemented, contract) · probe `/\bsettle\(/` binding 0, core 3 · README-SSR tells SSR users to seed `{}`, never `null`, because a nullish catalog makes the core's `t()` throw · The binding re-exports `LangsysConfigurationError` by reference (surface.test.ts) and leaves a block's registration promise to the app: with `requireCredentials` and no credentials, each of the page's eight registering blocks surfaces that error once, as an unhandled rejection, including blocks mounted before `init()` has answered, and a `register: false` block, which only reads, never fails: one phrase, several, a `<Phrase>`, before `init()` and after (`_dev_/e2e/credentials.mjs`, 8/8, with the same page and no `requireCredentials` as the control that surfaces nothing; control, the read-only page against core `e1c39e78` surfaces 3; mutation, a block swallowing the rejection, 1 red); a server render surfaces none (src/ssr-measure/var/require-credentials.test.ts). Nothing throws while the app boots: without credentials `init()` resolves unconfigured and the page renders source with its values filled, through `$t` and through a block, with the option and without it (credentials.mjs), and `isConfigured()` reports it (require-credentials.test.ts); `requireCredentials` reaches the core under that name through `init`, and the exception surfaces at first use, from the blocks' registrations. README, _Running without credentials_ |
| WIRE-5 | implemented | live | Redirect: the testbed points the SDK at the API `VITE_LANGSYS_BASE_URL` names, the local one at `https://api.langsys2.test/api`, with `init({ apiUrl })` through this binding's `init` override (harness.ts, grant route) — E2E TEST 7 sees requests arrive at that API's origin, cross-origin from the page, and TEST 11 and TEST 16 read server state back from it. Findability: README.md "Pointing the SDK at another API" (src/docs.test.ts; mutation removing the section reds 1). The late-`setBaseUrl` ordering failure is the core's (core row WIRE-5) and is warned against in the same section |
| CONF-1 | implemented | contract | Rows graded on a property the API decides rest on server state, never on requests. Contract: HINT-13 and GATE-10 read `contract-fixture`'s accepted state (stored hints, registered phrases and blocks). Live: GRANT-3/4 on the authorization response body and catalog contents (E2E TEST 16), registration on 2xx plus presence in the catalog (TEST 11), no 4xx/5xx across the suite. Outgoing-request observations — TEST 3's header, TEST 10's report URLs — grade nothing on their own. Every path: MARK-1 and GATE-10 are proven per reader (`<Phrase>` and `<Translate>`), and the server path is measured separately (SRV-1) |
| CONF-2 | implemented | n/a (pure) | This file. `node _dev_/conformance-summary.mjs --check` reads the rule list out of the blob the header cites and fails on a missing, duplicate, family or unknown row, a non-canonical status or tier, `implemented` below live, contract or pure, and `delegated` with a tier; `--self-test` shows each check firing. The contract tier is `contract-fixture/`, vendored byte-exact and cited by tree `39ecf1292b4708719256431e44730eb94ca2b1ab`. Absences: HINT-13's no-hint-for-B and GATE-10's suppressions are each evidence because a sibling case in the same run shows the double accepting that action for the same key — a stored hint for B, a registered unmarked block — and neither rule is about a capability the SDK learned, so no drift applies. Capability-drift rows are delegated to the core, which drifts them (core rows GATE-1, HINT-9). No row is provisional |
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
SRV_API=http://127.0.0.1:8787/api SRV_KEY=k-write npm run dev && node _dev_/e2e/var.mjs   # 33/33

# A locale switch overtaken by another; and an app without credentials — each starts its own double
npm run dev && node _dev_/e2e/locale-race.mjs                                           # 4/4
npm run dev && node _dev_/e2e/credentials.mjs                                           # 8/8

# The published preprocessor entry
npm run package && node _dev_/preprocess-entry.mjs                                      # 4/4

# SRV-3 — the double with a 3 s flush, then one dev server per key
node _dev_/e2e/srv-flush.mjs --serve
SRV_API=http://127.0.0.1:8787/api SRV_KEY=k-write npm run dev && node _dev_/e2e/srv-flush.mjs --expect write
SRV_API=http://127.0.0.1:8787/api SRV_KEY=k-read  npm run dev && node _dev_/e2e/srv-flush.mjs --expect read
```

**Upgrade audit from 3.6.17** — `_dev_/upgrade/README.md` says how to build the two cores:

```bash
node _dev_/upgrade/peer-probe.mjs                                       # Kit 2.9.0: ERESOLVE with this tree's peers, 0 with 3.6.17's
OLD_CORE=… NEW_CORE=… node _dev_/upgrade/core-surface.mjs               # 32 names, 19 members, none missing
OLD_CORE=… NEW_CORE=… node _dev_/upgrade/id-moves.mjs                   # 19/41 fixture ids move; 19/19 moved render source
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
| BIND-1 | `if (pastHydration)` → `if (true)` in stores.ts | 7 unit (stores.test.ts, kit.test.ts) |
| BIND-4 | add `discovery?: boolean` to the Svelte config | 1 svelte-check error |
| BIND-5, BIND-6 | remove the accessor check from the proxy handler | 3 (1 fixture row, 2 core-generated rows) |
| BIND-6 | hide `init` from `OVERRIDDEN_MEMBERS` / delete the `init` override / hide `getCountries` | 1 / 2 / 1 |
| BIND-6 | forward with the proxy as receiver | proxy-receiver.test.ts fixture rows |
| REF-1 | the binding overrides `getCountries` and reads the list itself | 3 unit (reference-reads.test.ts, 2: the call sends a request of its own, and inside a request it names no request locale; surface.test.ts, the override set) |
| REF-1 | the proxy holds each list call's first answer, whatever the display locale | 7 unit (reference-reads.test.ts: the six calls, and the request's locale) |
| REF-1, SRV-6 | `createLangsysHandle` opens the scope in `en`, not the request's locale | 3 unit (reference-reads.test.ts, the request's locale; credentials.test.ts, 2) |
| GRANT-1 | `adaptWriteGrant` passes a store through unadapted | 4 (adapters.test.ts) |
| GRANT-2 | `adaptWriteGrant` snapshots the store at adapt time | 3 (adapters.test.ts) |
| GRANT-3 | the `setWriteGrant` override resolves without calling the core | 5 live (TEST 3 ×2, TEST 16 ×3) |
| GRANT-4 | the `init` override drops `writeGrant` | 3 live (TEST 8 ×3) |
| MARK-1 | remove `{...markerAttr}` from Phrase.svelte | 1 (served-bytes.test.ts) |
| MARK-1 | remove `{...stamp}` from Translate.svelte (an app-supplied `custom_id` on the served host, fallback path) | 1 (served-bytes.test.ts) |
| SRV-1 | remove the server `warnUnrenderedBlock(…)` call from Translate.svelte and Phrase.svelte | 1 (unrendered-notice.test.ts: no notice) |
| SRV-1 | drop the server-only guard on that call | 2 (the client-path control emits a notice) |
| SRV-2 | `createLangsysHandle` drops the `credentials` it is given | 2 unit (credentials.test.ts: the two projects' requests, and the read key) |
| SRV-7, SRV-2 | `createLangsysHandle` renders `resolve()` outside `scope.run` | 3 (srv-scope.mjs: German premise, case 1, case 2 at every response) |
| — (core regression guard) | run `svelte-dom.mjs` against core `c635a94f`, before the core wrote `<Phrase>` and `<option>` text in place | 2 (the `<Phrase>` expression and the two-token `<option>` expression stay on their first translation) |
| SRV-3 | `createLangsysHandle` awaits `scope.close()` before returning | 2 (srv-flush.mjs: the page takes 3 s; the phrase is already registered on arrival) |
| SRV-4 | `hydrateFromServer` does not seed | 1 (srv-scope.mjs: the hydrated page re-renders to `Pricing`) |
| SRV-7 | one core scope shared by every request (`SRV_SEAM=shared`) | 4 (case 1 ×2, case 2 at 400/800, and SRV-4: the hydrated page keeps the German it was served) |
| VAR-1, VAR-6 | the transform emits the value as text, no marker pair | 44 unit (canonicalization rows, preprocess, served bytes, block content, dont-translate.test.ts, fallback-category.test.ts) · 13 VAR (with the registered content and its premise) |
| VAR-2 | placeholder names not taken from the core | 99 unit (every naming-vector row) · 21 VAR |
| VAR-2 | repeated expressions merged by their source, before the core names them | 5 unit (the repeat rows, as vectors and through the build) |
| VAR-6 | an object second argument to a `$t` template literal taken as the category | 2 unit (preprocess.test.ts: the argument order; a written key not taken) |
| VAR-6 | a `null` second argument to a `$t` template literal read as the category | 1 unit (preprocess.test.ts) |
| VAR-6 | runtime params override a `$t` template literal's own values | 1 unit (preprocess.test.ts) |
| VAR-6 | an object literal with computed keys taken as written | 1 unit (preprocess.test.ts) |
| VAR-6 | a `$t` template literal's other arguments evaluated inside a wrapper function | 1 unit (preprocess.test.ts: an awaited argument no longer compiles) |
| VAR-6 | a `$t` template literal's runtime form reads the store after its arguments | 1 unit (preprocess.test.ts, the read order) |
| VAR-6 | any non-string second argument to a `$t` template literal read as the params | 1 unit (preprocess.test.ts: an `undefined` or numeric category loses the params after it) |
| VAR-6 | a `$t` callee spelled from the call's start, so `($t)(…)` keeps its parenthesis | 1 unit (preprocess.test.ts: the call no longer compiles) |
| VAR-2 | a `$t` template literal's written keys taken only when the call is decided at build time | 1 unit (preprocess.test.ts: a key beside a computed one is not taken) |
| VAR-2 | an object literal behind a TypeScript cast: its keys not taken | 2 unit (preprocess.test.ts: in `$t`, and in `params`) |
| VAR-2 | an object literal behind an angle-bracket cast: its keys not taken | 1 unit (preprocess.test.ts, the params cast) |
| VAR-2 | an angle-bracket assertion not unwrapped when naming | 1 unit (naming.test.ts) |
| VAR-2 | a value inside an exclusion named among the unit's own values | 4 unit (preprocess.test.ts, 3; dont-translate.test.ts, the registered key) |
| VAR-2 | an excluded value kept when it changes an own value's name | 1 unit (preprocess.test.ts: `name` twice in the params) |
| VAR-2 | an excluded value kept under a name no own value has | 1 unit (preprocess.test.ts: `name` twice in the params) |
| VAR-2 | a name written inside an exclusion not taken | 1 unit (dont-translate.test.ts: the caller's value replaces the user's) |
| VAR-2 | an unnameable value inside an exclusion warned about | 1 unit (preprocess.test.ts) |
| VAR-2 | a `<Translate>` or `<Phrase>` nested in a block not made a unit of its own | 7 unit (preprocess.test.ts, 4; block-content.test.ts, 3: the key, and the renders) |
| VAR-2 | a nested unit not handed its own params | 5 unit (preprocess.test.ts, 4; block-content.test.ts, the render) |
| VAR-2 | a unit made of a block nested inside a phrase | 2 unit (preprocess.test.ts, 2) |
| VAR-2 | a nested unit numbering its values from zero, beside the block's own | 1 unit (preprocess.test.ts) |
| VAR-2 | a nested unit's own params not taken as a unit's | 1 unit (block-content.test.ts: an unset value shown as `{nick}`) |
| VAR-2 | a name written in an attribute a translator reads not taken | 1 unit (preprocess.test.ts) |
| VAR-6 | an attribute's value inside a phrase made a placeholder | 2 unit (preprocess.test.ts; block-content.test.ts, the served `title` and `alt`) |
| VAR-2 | a button's or a submit or button input's `value` not read as a label | 2 unit (preprocess.test.ts; block-content.test.ts, the submit label) |
| VAR-6 | an `<input>` whose `type` an expression decides read as ordinary | 1 unit (preprocess.test.ts) |
| VAR-2 | a nested unit's params taken as a unit's one level deep only | 1 unit (block-content.test.ts) |
| VAR-2 | a name written beside a value in an attribute not taken | 1 unit (preprocess.test.ts) |
| VAR-2 | a name written in an attribute taken only where a translator reads it | 1 unit (preprocess.test.ts: one inside an exclusion, in another attribute, and in a phrase) |
| VAR-2 | a name written in a nested host's `class` not taken | 1 unit (preprocess.test.ts) |
| VAR-2 | a name written in the block's own host `class` not taken | 1 unit (preprocess.test.ts: a `<Phrase>` and a `<Translate>` standing alone) |
| VAR-2 | a name written beside a value in an attribute no translator reads not taken | 1 unit (preprocess.test.ts: `href="/u/%name%/{id}"`) |
| VAR-2 | a name written in a nested host's `class` taken as the outer unit's | 1 unit (preprocess.test.ts: the nested `<Phrase>` and `<Translate>`) |
| VAR-2 | the block's own host `class` read only when written all as text | 1 unit (preprocess.test.ts: `class="To %name% {cls}"`) |
| VAR-2 | a name written in a `$t` template literal's text not taken | 1 unit (preprocess.test.ts) |
| VAR-2 | a name written in a `$t` template literal's text taken only as `%name%` | 1 unit (preprocess.test.ts: `{name}`, and an ICU argument) |
| SRV-1 | an attribute written without a value rendered as "true" | 1 unit (block-content.test.ts) |
| SRV-1 | a boolean attribute written without a value dropped | 1 unit (block-content.test.ts: `hidden` and `disabled`) |
| VAR-6 | a `<Translate>` or `<Phrase>` inside a `<DontTranslate>` read when a fallback is walked | 2 unit (preprocess.test.ts; dont-translate.test.ts) |
| VAR-6 | a fallback block's own units given no category | 13 unit (preprocess.test.ts, 3; dont-translate.test.ts; fallback-category.test.ts, 9) |
| VAR-6 | one context key for every fallback block | 2 unit (fallback-category.test.ts: the block another component wraps the unit in, and the inner instance of its own) |
| VAR-6 | one key per file, shared by every instance of the component | 2 unit (preprocess.test.ts; fallback-category.test.ts, the inner instance of its own) |
| VAR-6 | a spread after a category written as text not seen | 1 unit (fallback-category.test.ts) |
| VAR-6 | an exported snippet's keys declared in the instance script | 3 unit (preprocess.test.ts, 3) |
| VAR-6 | a top-level snippet an exported one renders keeps its keys in the instance script | 2 unit (preprocess.test.ts, 2) |
| VAR-6 | every top-level snippet keyed in the module script | 1 unit (preprocess.test.ts) |
| VAR-6 | a property named like a top-level snippet taken as a render of it | 1 unit (preprocess.test.ts) |
| VAR-6 | an exported snippet's own parameter hiding a top-level snippet not seen | 1 unit (preprocess.test.ts) |
| VAR-6 | an exported snippet's parameter list read whole as names it binds | 1 unit (preprocess.test.ts: default values and a computed key hide the snippets they name) |
| VAR-6 | a computed key in a parameter pattern not read | 1 unit (preprocess.test.ts) |
| VAR-6 | an array pattern in a parameter not walked | 1 unit (preprocess.test.ts: a default nested in one, and one after a hole) |
| VAR-6 | a rest element in a parameter not walked | 1 unit (preprocess.test.ts) |
| VAR-6 | a type read as a render | 1 unit (preprocess.test.ts: `typeof lone` in an `as`, in type arguments and in an arrow's annotations) |
| VAR-6 | a parameter's default value not read for snippets it renders | 1 unit (preprocess.test.ts) |
| VAR-6 | a computed member taken as a property name | 1 unit (preprocess.test.ts: `lookup[hd]`) |
| VAR-6 | keys named as a name the file declares | 1 unit (preprocess.test.ts) |
| VAR-6 | a unit's category read once, not followed | 2 VAR (the unit follows the block's category when it changes, on a read key and a write key) |
| VAR-6 | the block's category read on the server only | 5 VAR (served and hydrated; rendered by the client and following a change, on a read key and a write key) |
| VAR-6 | a fallback block that provides no category | 10 unit (dont-translate.test.ts; fallback-category.test.ts, 9) |
| VAR-6 | the block's category preferred to the one a unit names | 2 unit (fallback-category.test.ts: a spread on the unit, and a category it names after a spread decides the block's) |
| VAR-6 | a fallback inside a fallback not handed the outer one's | 2 unit (preprocess.test.ts; fallback-category.test.ts) |
| VAR-6 | a unit inside a unit inside a `<DontTranslate>` not marked | 1 unit (preprocess.test.ts) |
| VAR-6 | a unit inside an author's `translate="no"` or `data-notrans` element read | 2 unit (preprocess.test.ts, 2) |
| TOK-1 | a value inside a `<DontTranslate>` written as `%value%` | 12 unit (canonicalization.test.ts; preprocess.test.ts, 6; dont-translate.test.ts, 4; var-served.test.ts) |
| VAR-3 | a value inside a `<DontTranslate>` dropped | 12 unit (canonicalization.test.ts; preprocess.test.ts, 6; dont-translate.test.ts, 4; var-served.test.ts) |
| TOK-1 | `<DontTranslate>` emitted without `translate="no"` | 11 unit (preprocess.test.ts, 3; dont-translate.test.ts, 8) |
| TOK-1 | an author's `translate="no"` or `data-notrans` element read as ordinary markup | 3 unit (preprocess.test.ts, 2; dont-translate.test.ts, the attribute served as written) |
| TOK-1 | an exclusion an attribute decides at runtime read as none | 1 unit (preprocess.test.ts) |
| TOK-1 | a unit inside an element whose exclusion an expression decides read | 1 unit (preprocess.test.ts) |
| TOK-1 | a `<svelte:element>` excluding itself not seen | 1 unit (preprocess.test.ts) |
| TOK-1 | an expression attribute inside an exclusion making the block fall back | 1 unit (preprocess.test.ts) |
| TOK-1 | an expression `translate` or `data-notrans` deciding before an exclusion written in the other | 1 unit (preprocess.test.ts) |
| TOK-1 | an exclusion written beside an expression in the other attribute read as ordinary | 1 unit (preprocess.test.ts: the excluded `alt` a placeholder) |
| TOK-1 | attribute names matched only in lowercase | 1 unit (preprocess.test.ts, `TRANSLATE="no"`) |
| MARK-4 | the transform emits a nested `<Translate>` or `<Phrase>` without its marker | 11 unit (preprocess.test.ts, 4; block-content.test.ts, 5; dont-translate.test.ts; srv-capture.test.ts, the flush) |
| VAR-6 | a fallback block's nested blocks left untransformed | 21 unit (preprocess.test.ts, 9; dont-translate.test.ts; fallback-category.test.ts, 10; var-served.test.ts, the inner block served in English) |
| SRV-3 | a server render registers outside a request scope | 2 unit (server-registration.test.ts) |
| SRV-4 | `hydrateFromServer` seeds the catalog without the server's collected blocks | 1 VAR |
| BIND-1 | a one-shot read ends the hydration pass, so a `get()` in a universal `load` hands the hydration render the live value | 1 unit (stores.test.ts) |
| BIND-1 | `syncNavigation()` does not end the hydration pass on the first mount | 1 unit (kit.test.ts) |
| WIRE-4 | a block catches its registration's rejection | 1 (credentials.mjs: fewer than eight surface) |
| VAR-7 | the vanilla path always registers | 6 VAR (per-user phrase, a value in a block's registered content, `{#each}` fallback, mixed `{@html}`, `{#await}`, the plain route) · 2 credentials (the read-only page surfaces the error; the fallback blocks fail too, past the eight) |
| VAR-7 | no `warnUnregistered` call | 1 VAR (the notice) |
| VAR-7 | the `{@html}`-only block registers nothing | 1 VAR (the content registers) |
| MARK-1, SRV-1 | the tree host rendered without `hostAttrs` | 1 unit (var-served.test.ts) · 1 VAR (the stamp) |
| SRV-3 | no `registerBlock` on the server | 27 unit (srv-capture.test.ts, the flush; server-registration.test.ts, the in-scope control; block-content.test.ts, 6; dont-translate.test.ts, 9; fallback-category.test.ts, 10) · 3 VAR (a server render registers; the server's collected phrase; the hydrated client's resend check) |
| SRV-5 | each block rendered twice per render | 1 unit (srv-capture.test.ts, the per-block count) |
| GATE-10 | `registerBlock` handed a detached copy of the host (tree path) | 4 contract (three resolved `<Translate>` shapes and the resolved `<Phrase>` register) |
| SSR-3 | demote README.md's `[!IMPORTANT]` callout to a plain blockquote | 1 (docs.test.ts) |
| WIRE-5 | rename README.md's "Pointing the SDK at another API" section | 1 (docs.test.ts) |

The VAR, TOK-1, tree-path SRV and MARK-1, MARK-4, GATE-10 tree-path, fallback-notice, hydration, server-registration, WIRE-4, SRV-2 credentials and REF-1 mutations ran against core `a5954a3c` in an isolated copy that passed unmutated before any mutant ran (unit 374/374, VAR 41/41, contract 22/22, credentials 8/8), after one warm-up run of the VAR suite, which starts the copy's dev server cold; the shared-scope one in the working tree on that core. The kit mutations (SRV-3, SRV-4, SRV-7) ran against core `c635a94f`, each in an isolated copy that first passed unmutated; the server-stamp and shared-scope ones against `03685b82`, the SNAP one against `a639ae8c`, the MIG one against `2d57cdd9`, the HINT-13, GATE-10 and MSG-5 ones against
`86871033`; the rest ran against earlier core builds of this branch and touch only binding code
that has not changed since.

## Release-wave items

- **`dependencies.langsys-js-typescript` is `^0.6.4`, and the lockfile resolves registry `0.6.5`**,
  which predates this ticket. The range must match the core version that ships in the same wave.
  Until then a clean clone installs a core without the 838 surface, and CI on this branch cannot
  go green.
- **The VAR reader must be released first (VAR-4).** The range must require the core release
  that carries VAR-3's reader, `register: false`, `warnUnregistered`, `LangsysConfigurationError` and `seedCatalog`'s served-state argument (at `a5954a3c` here): `"langsys-js-typescript": "^0.7.0"` once the core's v0.7.0 tag exists. A 0.x caret holds the minor, so an app on `^0.6.4` reaches the new core only through this binding's release.
- **The release is a major (4.0.0).** The upgrade audit from 3.6.17 (core 0.6.5) finds four changes an app must make (the Kit peer floor, registration only through the transform, lowercase locale values, `detectPreferredLocale` returning `false`) and blocks whose id the core's tokenizer moved, which render source text until translated again. The table is `_dev_/upgrade/AUDIT.md`, each row backed by a script beside it: `peer-probe.mjs` (the Kit floor), `core-surface.mjs` (locale values, `detectPreferredLocale`, the 3.6.17 surface, console output) and `id-moves.mjs` (ids, routes, and what the pinned core renders for a block 0.6.5 stored). CHANGELOG, _Upgrading from 3.6.17_.
- **`langsys-js-svelte/preprocess`** is a new subpath export, a Node module run by the bundler,
  and `magic-string` a new dependency of it.
- **`<Translate>` and `<Phrase>` register nothing without the transform** (VAR-7): the release
  notes say so first.
- **`langsys-js-svelte/kit`** is a new subpath export (`package.json` `exports`), and a published
  surface from the first release that carries it. `@sveltejs/kit` is declared an optional peer for it,
  from `^2.10.0`: `hydrateFromServer()` is wired through the `init` client hook, which SvelteKit runs
  from 2.10.0 on.
