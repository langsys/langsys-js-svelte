# CONFORMANCE — langsys-js-svelte

|                            |                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec text read             | `docs/sdk-spec.mdx` blob `06ae105a0a1f7b5245ec32929f0b3885c63f0336`, from `langsys2` `origin/main` @ `7bee50d63e7889696b037aec313578d981c7354a`                                                                                                                                                                                                                              |
| Read at                    | 2026-08-31T21:01:10Z, via `git show` — not from a working copy                                                                                                                                                                                                                                                                                                               |
| Repo state                 | branch `feature/838_write_key_gating_reland`, rebased on `main` @ `a00a32f`                                                                                                                                                                                                                                                                                                  |
| Base SDK under test        | `langsys-js-typescript` `feature/838_write_key_gating_reland` @ **`82678b6`** — **resolved** from the symlink at gate time, not quoted                                                                                                                                                                                                                                       |
| Why resolved, not quoted   | The symlink points at a shared working copy whose HEAD moves. This row first read `e0c2d7b` — correct when the lane opened, now an ancestor — a stale citation in the provenance line itself. `dist/` is gitignored there, so a git ref carries no build: you get whatever that clone has checked out and built at the moment you look. **Resolve it, never transcribe it.** |
| Profiles binding this repo | **browser** + **binding** + **all**                                                                                                                                                                                                                                                                                                                                          |
| Rules in the spec          | **67**                                                                                                                                                                                                                                                                                                                                                                       |
| In profile scope           | **66** — only `HINT-2` (server) is out                                                                                                                                                                                                                                                                                                                                       |
| Unit suite                 | **34 tests / 5 files**. Evidence is **mixed and stated per row**: most import the real core, but `stores.test.ts` `vi.mock`s it to drive the signal deterministically. An earlier version of this row claimed "no doubles" for the whole suite — false, and corrected here.                                                                                                  |
| Integration suite          | **49 assertions**, evidence **`live`** — real browser, real base SDK, real API, real catalog reads                                                                                                                                                                                                                                                                           |

The spec blob is byte-identical to the one the Angular lane read (`06ae105a`) from an earlier
commit, so the two audits read the same rules.

## Scope — why this file is short

This is a **binding**. BIND-1 says it may adapt shape and timing and never meaning, so most of
the spec is not its to satisfy: the core owns registration, discovery, catalog reads, identity
and interpolation outright. Grading those here would produce rows that cannot fail — the
green-proving-nothing failure CONF-1/CONF-3 exist to stop.

So this file carries three things: the binding backbone (BIND-1..6), the rules this binding could
**interfere** with, and one delegation block for families the core owns. A rule absent from this
file is absent because this binding cannot reach it.

## Grades

| Grade         | Means                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `implemented` | Behaviour present, evidence `live` or `contract`. Reachable here because the integration suite runs against a real API and the real core — not a double.         |
| `provisional` | Behaviour present, evidence `mock` only. CONF-2's ceiling.                                                                                                       |
| `partial`     | Present but incomplete, with the gap described in the row.                                                                                                       |
| `delegated`   | The core owns it and this binding **demonstrably does not participate** — an absence probe plus a positive control proving the probe could have found something. |
| `n-a`         | Unreachable, with the reason and the condition that would make it live. **profile-n/a** and **architecture-n/a** are kept distinct.                              |
| `open`        | Not mine to answer alone. Named, routed, unresolved. Never green.                                                                                                |

**On the ceiling.** Angular's file grades `provisional` throughout because its evidence is `mock`
(jsdom, SDK doubled, zero network). That is not this repo's position and the grades are not copied:
`_dev_/e2e/verify.mjs` drives a real browser against the real base SDK and a live API, asserts
**server acceptance** and **catalog state** rather than request payloads, and is proven falsifiable
by mutation. Where a row says `implemented`, that is the reason.

## 1 — Binding rules (BIND-1..6)

| Rule                                             | Grade         | Evidence                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BIND-1** — adapt shape/timing, never meaning   | `implemented` | Adaptation is confined to Svelte's model: `Writable`→`Signal` (`adapters.ts`), a store form of `writeGrant`, and the hydration timing guard in `stores.ts`. The guard changes **when** the value is observable, never what it is. Mutation-proven: disabling the deferral fails exactly 3 hydration assertions and nothing else.                                |
| **BIND-2** — never branch on server capability   | `implemented` | Zero branches on `write_enabled` or `key_type` anywhere in `src/lib` (probe below). `writeEnabled` is surfaced as a tri-state and never read to decide anything here.                                                                                                                                                                                           |
| **BIND-3** — owns no network behaviour           | `delegated`   | Comments-stripped probe for `fetch(\|XMLHttpRequest\|setInterval\|retry\|backoff\|headers`: **0 in this binding, 17 in the core**. Filter: `sed -E 's://.*$::'` per file. Raw count is also 0, so no filter artefact here.                                                                                                                                      |
| **BIND-4** — no configuration the core lacks     | `implemented` | The Svelte config adds exactly one key beyond the core's — `UserLocaleStore` — and **widens the type** of `writeGrant` to accept a store. No `discovery`, `hint` or `suppress` option exists. Widening is shape, not meaning: `adaptWriteGrant` resolves the store **per call**, matching the core's per-request resolution (`adapters.test.ts`, 7 assertions). |
| **BIND-5** — does not cache lookup results       | `implemented` | **No memo of any kind sits in front of `t()`** — `t` is the core's own signal object, asserted by identity (`surface.test.ts`). Probe for `memo\|cache\|Map(\|WeakMap\|derived(` in `src/lib`: 0 code matches. See the measured re-entry finding below, which is a **property of Svelte's model, not a cache**.                                                 |
| **BIND-6** — wrap the narrowest surface possible | `implemented` | `t`, `currentlyLoadedLocale`, `sTranslations`, `LangsysAppAPI` and `canonicalizeLocale` are re-exported **by reference**, pinned by `toBe` identity assertions. Exactly one deliberate exception, `writeEnabled`, with an absence assertion **and** the identity assertions as its positive control.                                                            |

### BIND-5 — the measured re-entry finding

Angular's pipe memo suppressed per-URL discovery on route changes. **This binding has no memo, so
that defect cannot occur here** — but "no memo" and "re-enters `t()`" are different claims, and the
second is the one discovery depends on. The core records a miss **per URL, before** its registration
dedup, so a phrase that does not re-enter is never attributed to the second URL.

Measured rather than assumed (`verify.mjs` TEST 14): a phrase rendered in the persistent `/e2e`
**layout**, counted across a real client-side navigation.

```
baseline count            3
after client-side nav     3      (+0)
layout remounted?         no     (window counter survived)
```

**A persistent component does NOT re-enter `t()` on client-side navigation in Svelte's model.** The
layout does not remount and nothing invalidates the expression, so a layout-level phrase is attributed
to the **first** URL only. Recorded as a finding rather than a pass: it is not a defect in this
binding — there is nothing here to fix — but it is a real limit on per-URL discovery for layout
content, and it is invisible without the counter. Routed as `open` below.

## 2 — Rules this binding could interfere with

| Rule                                                     | Grade         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GATE-1** — branch on `write_enabled`                   | `implemented` | Live gate matrix: `read`→false, `ip_write` (loopback)→true, `write`→true, plus `ip_write`+`X-Forwarded-For`→false. Asserted through **rendered DOM** and cross-checked against the `authorize-project` response body. The `X-Forwarded-For` leg is proven **indirectly**: the forged-origin flip is exercised by the hint-attribution lane (which needs a genuinely read-only session to fire at all) rather than by a dedicated gate-matrix row, so its evidence is a precondition of another assertion rather than an assertion of its own. |
| **GATE-3** — never persist the decision                  | `implemented` | This binding persists nothing. The never-persist contract is documented at the core's `persist()` at this repo's request; `stores.ts` holds the value in memory only and re-derives per session.                                                                                                                                                                                                                                                                                                                                              |
| **GATE-8** — missing `write_enabled` is a version signal | `implemented` | The tri-state is preserved end to end: `Readable<boolean \| undefined>`, `undefined` never collapsed to `false`. Asserted in `stores.test.ts` (`never substitutes false for "not known yet"`) — which **mocks the core**, so it alone would cap this row at `provisional`. The grade rests on the **live** corroboration in `verify.mjs` TEST 1: `safe=undefined` while `raw=true` in a real browser against the real core, which is the same tri-state claim with no double in the path.                                                     |
| **HINT-3** — capture the URL at miss time                | `implemented` | Live: miss on `/e2e/nav`, navigate away inside the jitter window, wait it out — two hints arrive, each naming its own URL. A fire-time read would collapse both onto the destination.                                                                                                                                                                                                                                                                                                                                                         |
| **HINT-4** — one report per captured URL                 | `implemented` | Same run: 2 distinct URLs, 2 hints, no cross-route batching. Unique `?run=` id per execution so the server's 60s dedup cannot masquerade as a pass.                                                                                                                                                                                                                                                                                                                                                                                           |
| **WIRE-3** — lowercase `xx-yy` on the wire               | `implemented` | **Defect found and fixed in this lane.** `index.ts` and `README.md` both claimed `en-us` → `en-US` — the exact casing WIRE-3 forbids. The real `canonicalizeLocale` lowercases on both branches. Corrected, and pinned by `locale.test.ts` (5 assertions) which calls the **re-exported function**, never a restated literal.                                                                                                                                                                                                                 |
| **SSR-1** — don't collect server-side under `'client'`   | `implemented` | Documented correctly after this lane's earlier correction, and exercised by the `/e2e/ssr-write` procedure.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **SSR-2** — degrade `'server'` loudly with a grant       | `implemented` | Live, discriminating: with a **valid** grant configured, `'server'` degrades, warns with the reason, and registers **0** phrases; without a grant the same route registers 2. A zero with an invalid token would have proven nothing.                                                                                                                                                                                                                                                                                                         |
| **SSR-3** — origin IP allow-listing is a precondition    | `partial`     | The allow-listed side is proven live (loopback). The **refused** side cannot be produced from here — the flush originates inside the SDK's own `fetch` in Node. Covered upstream by the backend's gate test and the core's forged-XFF run. Stated rather than claimed.                                                                                                                                                                                                                                                                        |
| **CONF-1** — assert what the server accepted             | `implemented` | The suite asserts registration POSTs return 2xx, phrases **appear in the catalog**, hints answer 204, and no API call anywhere returns 4xx/5xx. Added after an audit found it asserted only on captured requests.                                                                                                                                                                                                                                                                                                                             |
| **CONF-3** — prove runtime rules by mutation             | `implemented` | Two live mutations: disabling the hydration deferral fails exactly 3 assertions; swapping the symlink for the registry build fails exactly 3 precondition assertions **while the positive control passes**.                                                                                                                                                                                                                                                                                                                                   |

## 3 — Delegation block: families the core owns

Every row is an **absence probe with a non-zero core count** — "we found nothing" is worthless
unless the same search demonstrably finds something where it lives.

**Probe method.** Per file under `src/lib` (tests excluded), `sed -E 's://.*$::'` to strip line
comments, then `grep -cE <pattern>`; the core column runs the same pattern over
`langsys-js-typescript/src/**/*.ts`.

| Family    | Grade       | Binding | Core   | Pattern                                                 |
| --------- | ----------- | ------- | ------ | ------------------------------------------------------- |
| **REG**   | `delegated` | **0**   | **55** | `missingToken\|updateTokens\|translatable-items\|flush` |
| **HINT**  | `delegated` | **0**   | **9**  | `discovery/hint\|recordMiss\|postDiscoveryHint\|jitter` |
| **CAT**   | `delegated` | **0**   | **16** | `hasOwnProperty\|lookupContent\|sTranslations.get`      |
| **CID**   | `delegated` | **0**   | **22** | `generateCustomId\|md5`                                 |
| **GATE**  | `delegated` | **0**   | **16** | `write_enabled\|writeEnabled.set\|canWrite`             |
| **CACHE** | `delegated` | **0**   | **5**  | `localStorage\|persist(`                                |
| **ICU**   | `delegated` | **0**   | **22** | `IntlMessageFormat\|interpolate(\|plural`               |

**ICU filter note.** The raw count in the binding is **2**, both JSDoc prose ("ICU pluralization",
"pluralizes") inside `/* */` blocks that the line-comment filter does not strip. Code matches: 0.
Published because a delegation row whose number is an artefact of its own filter is exactly the
kind of evidence this program refuses.

## 4 — Not applicable, with the distinction kept

| Rule                           | Kind  | Reason and expiry |
| ------------------------------ | ----- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **HINT-2**                     | `n-a` | **profile-n/a**   | "Server SDKs never report" — this is a browser binding. Becomes live only if this package ever ships a server profile, which would be a different package.               |
| `ip_write` / `translatePage()` | `n-a` | **profile-n/a**   | Server-profile surface per the spec's family table. The `ip_write` **key** is used here as a test fixture, but the rule about server-side address stability is not ours. |

## 5 — Open

| Item                                                                                                                                                                                                                                                                                                                                                                     | Routed to | Status                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------------------------------- | -------- |
| **Layout-level phrases are attributed to the first URL only** (BIND-5 measurement above). Not a binding defect — there is no cache to remove — but per-URL discovery does not reach persistent components in Svelte's model. Whether that is acceptable, or wants a documented pattern (put discoverable content in `+page`, not `+layout`), is a spec/product question. | `open`    | Reviewer, topic `838-audit-svelte` | **open** |
| **SSR-3 refused side** — unreachable from this repo; covered upstream. Listed so the partial grade has a stated owner.                                                                                                                                                                                                                                                   | `open`    | backend + core                     | **open** |

## Summary — counts computed from the tables above

| Grade          | Count  |
| -------------- | ------ |
| `implemented`  | **15** |
| `delegated`    | **8**  |
| `partial`      | **1**  |
| `n-a`          | **2**  |
| `open`         | **2**  |
| `provisional`  | **0**  |
| **Total rows** | **28** |

Produced by `node _dev_/conformance-summary.mjs`, which parses the grade cells out of the
tables above. The first version of this block said `delegated 7 / total 27` — it dropped
**BIND-3's own delegated row**, because it was hand-counted under the word "computed".
Caught in review, not here. The script exists so the label is true: run it and diff it
against this block.

Rows are graded behaviours, not one row per spec rule: the delegation block covers seven families
in seven rows rather than the ~40 individual rules inside them, because a per-rule row for a family
this binding demonstrably does not touch would be forty rows that cannot fail.

## 6 — Corrections recorded as corrections

- **`PHRASE_MARKER_ATTR` was hardcoded.** `Phrase.svelte` emitted the literal `data-ls-phrase`. The
  core's `isPhraseMarked()` is what makes `Translate` skip a marked subtree, and it reads the core's
  own constant — so a literal that drifted would have split a markup-bearing run silently, which is
  the exact failure `<Phrase>` exists to prevent. Now imported and spread so the attribute **name**
  comes from the core.
- **Locale casing was documented backwards.** See WIRE-3 above. Found by calling the function rather
  than by re-reading either the doc or the code.
- **Two released CHANGELOG entries still carry the wrong casing** — `## 3.2.0` (twice, lines ~311
  and ~315) and **`## 3.6.3` (line ~192)**. Both left in place: rewriting a released section is the
  defect this lane corrected earlier on this branch. The correction lives in `## Unreleased`.
  The 3.6.3 occurrence was **missed in the first version of this file** and found in review — a
  disclosure that listed one instance of a defect it had found twice.
- **A `1 + 2 = 3` placeholder was being counted as coverage.** `src/index.test.ts` was scaffold
  left from the project template — it asserted nothing about this package and could not fail
  meaningfully, yet it contributed to the suite count this file cites. Removed rather than
  padded: `surface.test.ts` now covers the package index properly. Count moves 35 → 34, which is
  the point — a number that includes a test that cannot fail is not a smaller number honestly.

- **Two new assertions silently did not run.** They were appended after `browser.close()` and the
  results print; the suite reported **39/39 green** while neither executed. Caught because the new
  assertion names were absent from output that should have contained them. Fixed by placement — and
  it is the third instance in this ticket of a green gate that was not examining what it appeared to.
- **A control compared the wrong process.** The rendered-output check first compared the browser's
  painted value against `writeEnabled` imported into the Node test process — a different module
  instance, never initialised, always `undefined`. Replaced with a comparison against the
  `authorize-project` response body: what the user sees against what the server decided.

## 7 — Reproducing this file's evidence

```bash
# spec, read the way this file read it
cd ../langsys2 && git fetch origin && git show origin/main:docs/sdk-spec.mdx

# unit suite (34 / 5 files)
npm test -- --run

# the symlink precondition must be RED against the registry build
npm test -- --run src/lib/upstream-precondition.test.ts   # green while linked

# integration suite (49 assertions, live)
npm run dev                                  # 127.0.0.1:5173, local API at langsys2.test
node --env-file=.env _dev_/e2e/verify.mjs

# gates CI runs
npm run lint && npm run check && node _dev_/changelog-coverage.mjs . --strict
```
