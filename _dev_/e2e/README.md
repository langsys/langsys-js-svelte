# E2E harness — ticket 838 (write-key gating & content discovery)

Dev-only. Not part of the published package; `_dev_/` is outside the `files` allowlist.

For a by-hand tour of each feature — linking the core, the pages to open and what to look for —
see [`../LOCAL-TESTING.md`](../LOCAL-TESTING.md).

## Setup

Requires a `.env` (gitignored) with the API base, project id, one key per permission
level, and the HS256 signing secret used to mint write grants — see `.env.example`.

Playwright **is** a declared devDependency, and its browser needs installing once:

```bash
npm install
npx playwright install chromium
```

It is declared so that `npm install` gives every harness its driver: a copy kept outside
the tree, in a temporary directory, disappears when that directory is cleaned.

## Running

```bash
npm run dev                                      # terminal 1 — 127.0.0.1:5173
node --env-file=.env _dev_/e2e/verify.mjs        # terminal 2
```

The page's origin must be one the API's CORS config lists; for another port, start the dev
server there and set `E2E_BASE_URL` to its origin. The suite also calls the API from Node, so
a local API served over HTTPS under a local certificate authority needs that CA in
`NODE_EXTRA_CA_CERTS`.

About two minutes (110–160 s on a freshly started server). The hint-attribution assertions deliberately wait
out the SDK's 5–30s jitter window twice over — see below. Start the dev server fresh before a
run you intend to cite: the hydration route initializes the singleton on the server, and a
long-lived process keeps whatever the first `init()` left there.

## What it covers

**61 assertions** (TEST 2 loops over three keys, TEST 9 over four grant cases; the rest are
straight-line): hydration safety, the read/ip_write/write gate matrix, cross-origin
requests and `X-Write-Grant` preflight, grant validity (valid / expired / no-`exp` /
none, all self-minted), the Svelte store form of `writeGrant`, server **acceptance** of
registrations, the three visibility shapes, params/interpolation and `<Phrase>`,
client-side navigation and shallow routing, hint URL attribution, MARK-1 (a `<Translate>`
host's stamp re-derived by the core's tokenizer, TEST 15), `setWriteGrant()` flipping a read
key on the server's answer with later misses landing in the catalog (TEST 16), and HINT-4's
per-URL re-entry measurement with a page-level positive control (TEST 14).

The SDK is pointed at the local API with `init({ apiUrl })` — the seam the README documents —
not with `LangsysAppAPI.setBaseUrl()`, which only works if it runs before `init()`.

Re-run before quoting that number — it is the count the harness prints, not one derived by
reading the source. This paragraph said **39** for one commit _after_ the suite reached 49,
in the same commit that raised it: the instruction was here and was not followed.

### Two things that are easy to get wrong when editing this

**Assert the premise, not just the result.** The hydration test checks that the _raw_
signal is concrete at hydration before asserting the safe store reads `undefined`.
Without that, a run where authorization simply failed passes for entirely the wrong
reason — everything reads `undefined` and the test looks green. That happened during
development and the premise check is what caught it.

**Size the hint window for both jitter timers.** The destination page's misses happen
after the navigation, so its 5–30s timer starts later than the origin page's. A window
sized for the first hint alone drops the second intermittently and looks exactly like a
cross-route batching regression.

Hint runs use a unique `?run=` id per execution so the server's 60s dedup window can't
swallow a legitimate hint and read as a failure. Note also that a hint is silently
dropped — same 204 — when the session is write-enabled, when the key could never write,
inside the dedup window, when the host doesn't match the registered site, or when the
project wouldn't auto-translate. Drive attribution tests from a genuinely read-only
session; the harness uses the `ip_write` key with a forged `X-Forwarded-For`.

## The SSR write lane is a separate procedure, on purpose

`ssrTokenStrategy: 'server'` is **not** in `verify.mjs`. `LangsysApp` is a process-wide
singleton and the SvelteKit dev server is long-lived, so the first `init()` in a process
wins for every later request — including requests for other routes. Folding the SSR
cases in would silently contaminate the hydration assertions, which also init on the
server.

Each case needs a **freshly started** dev server:

```bash
# Case A — 'server' strategy, no grant: the server registers, no browser involved
pkill -f "vite dev"; npm run dev &
curl "http://127.0.0.1:5173/e2e/ssr-write?run=ssrA1"
#   expect `Sending 2 tokens from SSR` in the server log, 2 phrases in the catalog

# Case B — same, with a valid grant: degrades to 'client', warns, registers nothing
pkill -f "vite dev"; npm run dev &
curl "http://127.0.0.1:5173/e2e/ssr-write?grant=1&run=ssrB1&token=<valid-jwt>"
#   expect the degrade warning, no `Sending ... from SSR`, 0 phrases in the catalog
```

Use a **genuinely valid** grant for case B. A zero with an invalid token proves nothing —
it would be a rejected token rather than the degrade.

Case A only exercises the allow-listed side, because a local dev server is loopback.
Under `'server'` the flush originates from the _origin server's_ IP, so an `ip_write`
key requires that IP to be allow-listed; when it isn't, the SDK makes zero registration
attempts by design and the failure is completely silent — no error, no failed request,
nothing in the catalog, and no hint, because SSR never hints. The refused side is
covered in the backend and core suites.

## SRV concurrency is a separate run, too

`_dev_/e2e/srv-concurrency.mjs` asks whether concurrent server renders in different locales
see each other's catalog through README-SSR's process-global seed. It renders `it-it` and
`de-de` eight at a time and reads the **served bytes** — no browser, no API, no `.env`.

```bash
pkill -f "vite dev"; npm run dev &
node _dev_/e2e/srv-concurrency.mjs
```

Two shapes, same harness. `body` is the documented pattern: `load` returns the catalog and
the component body seeds it. `load` is the **positive control**: it seeds, then awaits
before rendering — the placement README-SSR measured as unsafe. The run fails if the
control shows no leak, because a zero for `body` from a harness that cannot see
interleaving would mean nothing. Both shapes write process-global signals, so give the run
its own freshly started server.

## SRV-7 — the request scope

`_dev_/e2e/srv-scope.mjs` runs the core's request scope through SvelteKit's own request
lifecycle. `src/hooks.server.ts` runs every `/e2e/srv-scope` request through the package's own
`createLangsysHandle`, and `src/hooks.client.ts` calls `hydrateFromServer()`, exactly as an app
does. Which scope is chosen by `SRV_SEAM` when
the dev server starts:

```bash
SRV_SEAM=core   npm run dev     # the core's scope
SRV_SEAM=global npm run dev     # no scope: the process-global seed, in the request hook
SRV_SEAM=shared npm run dev     # the rule's mutation: one core scope for every request
node _dev_/e2e/srv-scope.mjs
```

On served bytes: a German render and then an Italian one in the same process, and 100 × 8
concurrent Italian and German renders that await in `load` before they read. In a real browser:
the hydrated page keeps the served text with the seed, and re-renders without it (`?noseed=1`).
`core` passes all nine; `global` and `shared` fail the concurrent case. Freshly started server
per run. Starting the server with `SRV_API` (the contract fixture's forwarder), `SRV_PROJECT` and
`SRV_KEY` also initialises the SDK on the server, which the post-response flush needs.

## SRV-3 — the post-response flush

`_dev_/e2e/srv-flush.mjs` checks that a server render's missed phrases are sent after the
response, and only by a key that may write, against an SDK test clone through the contract
fixture's forwarder (`_dev_/contract/README.md`, for the clone's environment). The case's
`POST /translatable-items` is answered 3 s late, so the order of events shows up as two numbers:
the page arrives well inside 3 s, and the phrase is absent from the clone's catalog on arrival and
present after the flush.

```bash
eval "$(node _dev_/e2e/srv-flush.mjs --env write)"
SRV_API=http://127.0.0.1:8787/api SRV_PROJECT=$SRV_PROJECT SRV_KEY=$SRV_KEY npm run dev     # fresh server
node _dev_/e2e/srv-flush.mjs --expect write
eval "$(node _dev_/e2e/srv-flush.mjs --env read)"
SRV_API=http://127.0.0.1:8787/api SRV_PROJECT=$SRV_PROJECT SRV_KEY=$SRV_KEY npm run dev     # fresh server again
node _dev_/e2e/srv-flush.mjs --expect read
```

## Svelte DOM facts

`_dev_/e2e/svelte-dom.mjs` checks what Svelte does to DOM text it holds. `/e2e/reactivity`
(client-only) translates a `<Phrase>` with an expression and an `<option>` in a two-token block,
then changes state: the new value must reach the page, as it does for the in-place controls
beside them. That route is compiled without the transform, so it measures the core's DOM handler;
`/e2e/reactivity-var` runs the same cases compiled with it, where each value is a placeholder and
the new value must show in the translation. `/e2e/hydration-facts` is served with its text rewritten, as a server-translated
block would arrive: static text must hydrate as served, an expression as the client's value, and
a state change must reach a node written in place and not one that was replaced.
`/fixture/var-styled`, compiled with the transform, renders a component whose `<style>` targets
elements inside its `<Translate>` and `<Phrase>`, served and hydrated and again mounted after
hydration: each element carries the component's scoped-style class and its style applies, and an
unset value inside an attribute's text prints nothing. It needs no API: the blocks render their
source.

```bash
npm run dev                          # fresh
node _dev_/e2e/svelte-dom.mjs
```

## VAR — variables in registered text

`_dev_/e2e/var.mjs` runs `/fixture/var` (compiled with the build-time transform) and
`/fixture/var-plain` (without it) through `createLangsysHandle`, against an SDK test clone through
the contract fixture's forwarder, each case a project of its own (`_dev_/contract/cases.mjs`,
suite 2; the browser parts that register share case 2.2): served translations and ids,
plurals, one phrase for two users, a block's registered content holding placeholders and no values,
handlers, and the `{#await}` and `{@html}` cases. That a hydrated client resends nothing the server
collected is read at the browser's transport seam, on the page the clone's server render served. A
unit whose one token sits beside a `<DontTranslate>` at a
paragraph's edge keeps the space between them: served in Italian, in the base locale in the browser,
after hydration, rendered by the client after a locale switch, and on `/fixture/var-plain`, through
the core's DOM class. On `/fixture/var/category` a unit inside a fallback block takes the block's
category: served in Italian and hydrated, and rendered by the client after a locale switch, in a
read session and a write session, then following the block's category when it changes. The catalog
requests the browser makes carry `X-Langsys-Capabilities: icu`.

```bash
eval "$(node _dev_/e2e/srv-flush.mjs --env write)"
SRV_API=http://127.0.0.1:8787/api SRV_PROJECT=$SRV_PROJECT SRV_KEY=$SRV_KEY npm run dev     # fresh server
node _dev_/e2e/var.mjs
```

## Credentials, a locale race, fallback blocks

Each needs only a freshly started `npm run dev`. `locale-race.mjs` runs against an SDK test clone
and starts the contract fixture's forwarder itself; `credentials.mjs` sends no request, and
`freeze.mjs` answers the page's requests inside the browser.

- `_dev_/e2e/credentials.mjs` — `requireCredentials` with no key: the page's blocks surface
  `LangsysConfigurationError`s, mounted before `init()` or not, and the page shows the text as
  written, while `/fixture/var-plain`, whose blocks only read (`register: false`), surfaces nothing.
  Control: the same page without `requireCredentials` surfaces nothing, and renders source through
  `$t` and through a block.
- `_dev_/e2e/locale-race.mjs` — a locale switch overtaken by another: a slow French overtaken by a
  failing German leaves source and stores nothing under `de-de`; a slow Italian overtaken by a
  succeeding Portuguese shows Portuguese. The faults go in once the page's own requests have
  settled, and each race checks first that they hit its two requests in order.
- `_dev_/e2e/freeze.mjs` — what Svelte's updates show in a block on the core's DOM class
  (`/fixture/freeze`, hydrated, and `/fixture/freeze-csr`, client-only). Prints a table, asserts
  nothing; README.md's _Blocks the transform cannot read_ is that table.

## Never sent — the transport seam

`_dev_/e2e/seam.mjs` needs only a freshly started `npm run dev`, and no API: in real Chromium every
request the page makes is answered inside the browser and recorded, for a write-enabled session
whose registrations are all accepted, so a block that sends nothing does so by the binding's
choice. GATE-10 (`/fixture/gate10`): a block or `<Phrase>` under a resolved ancestor sends nothing.
VAR-7 (`/fixture/var-plain` and `/fixture/var`'s fallback blocks): the core's DOM class sends
nothing, while a block whose only dynamic part is `{@html}` sends its HTML as content. On every page
a control beside the check sends through the same session.

## Testbed routes

| Route                                                 | Covers                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/e2e/lanes?key=read\|ip_write\|write`                | gate matrix; `setWriteGrant` mechanism (sends a deliberately **invalid** grant — refusal is the expected result)         |
| `/e2e/hydration`                                      | `await init()` in a universal `load` — the mismatch path                                                                 |
| `/e2e/visibility`                                     | CSS-hidden vs `{#if}` vs `{#await}` discovery                                                                            |
| `/e2e/params`                                         | `<Translate params>`, `<Phrase params>`, unknown placeholders, literal `%`, unused-key warning                           |
| `/e2e/vanilla`                                        | isolation harness: same markup via the Svelte component vs the vanilla class — settles "is it core or is it the binding" |
| `/e2e/nav` , `/e2e/nav/elsewhere`                     | client-side nav + `pushState` during jitter                                                                              |
| `/e2e/grant?initial=<jwt>&next=<jwt>`                 | the Svelte store form, incl. expiry degradation                                                                          |
| `/e2e/ssr-write?grant=1&token=<jwt>`                  | SSR write lane (fresh server per case)                                                                                   |
| `/e2e/srv-concurrency/body\|load?locale=it-it\|de-de` | served bytes under concurrent renders: documented body seed vs. seed-then-await control (fresh server)                   |

**The layout nav lists every route except `/e2e/ssr-write` and `/e2e/srv-concurrency`,
deliberately** — both need a freshly started server, and a nav link would invite clicking
into them mid-session and silently contaminating the run. They are reachable by typed URL
only.

The nav also carries `data-sveltekit-reload`, so every lane switch is a real page load.
Without it these are client-side navigations, the app never remounts, and switching to a
lane with a different init signature trips the guard in `initLangsys` and renders
"Init failed" — which reads as a broken testbed rather than the singleton behaving as
documented. The in-page links under `/e2e/nav` must **not** carry it: those navigations
are the thing under test.

Phrases are deterministic with a `?run=<id>` override. Re-running the same id exercises
the registered-but-untranslated (`null`) case instead of a fresh miss — which is itself
worth testing, since a truthiness check there re-reports content that is already known.
