# E2E harness — ticket 838 (write-key gating & content discovery)

Dev-only. Not part of the published package; `_dev_/` is outside the `files` allowlist.

## Setup

Requires a `.env` (gitignored) with the API base, project id, one key per permission
level, and the HS256 signing secret used to mint write grants — see `.env.example`.

Playwright **is** a declared devDependency, and its browser needs installing once:

```bash
npm install
npx playwright install chromium
```

It was deliberately undeclared at first, to keep `package.json` and the lockfile
pristine while the base SDK came from the registry. That reason expired once the SDK
moved to a gitignored symlink — there was no longer a `file:` dep that could leak into
a commit — and keeping it out had a real cost: the out-of-tree copy was garbage-collected
twice between sessions, leaving the harness unrunnable both times.

**One local caveat.** While this branch consumes an unpublished base SDK via a symlink,
a plain `npm install` reconciles the whole tree and replaces that symlink with the
registry version — which does not carry the 838 surface. Re-create it afterwards:

```bash
rm -rf node_modules/langsys-js-typescript
ln -s ../../langsys-js-typescript node_modules/langsys-js-typescript
```

## Running

```bash
npm run dev                                      # terminal 1 — must be 127.0.0.1:5173
node --env-file=.env _dev_/e2e/verify.mjs        # terminal 2
```

~90 seconds. The hint-attribution assertions deliberately wait out the SDK's 5–30s
jitter window twice over — see below.

## What it covers

**39 assertions** (34 static call sites; TEST 2 loops over three keys and TEST 9 over
four grant cases): hydration safety, the read/ip_write/write gate matrix, cross-origin
requests and `X-Write-Grant` preflight, grant validity (valid / expired / no-`exp` /
none, all self-minted), the Svelte store form of `writeGrant`, server **acceptance** of
registrations, the three visibility shapes, params/interpolation and `<Phrase>`,
client-side navigation and shallow routing, and hint URL attribution.

Re-run before quoting that number — it is the count the harness prints, not one derived
by reading the source.

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

## Testbed routes

| Route                                  | Covers                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/e2e/lanes?key=read\|ip_write\|write` | gate matrix; `setWriteGrant` mechanism (sends a deliberately **invalid** grant — refusal is the expected result)         |
| `/e2e/hydration`                       | `await init()` in a universal `load` — the mismatch path                                                                 |
| `/e2e/visibility`                      | CSS-hidden vs `{#if}` vs `{#await}` discovery                                                                            |
| `/e2e/params`                          | `<Translate params>`, `<Phrase params>`, unknown placeholders, literal `%`, unused-key warning                           |
| `/e2e/vanilla`                         | isolation harness: same markup via the Svelte component vs the vanilla class — settles "is it core or is it the binding" |
| `/e2e/nav` , `/e2e/nav/elsewhere`      | client-side nav + `pushState` during jitter                                                                              |
| `/e2e/grant?initial=<jwt>&next=<jwt>`  | the Svelte store form, incl. expiry degradation                                                                          |
| `/e2e/ssr-write?grant=1&token=<jwt>`   | SSR write lane (fresh server per case)                                                                                   |

**The layout nav lists every route except `/e2e/ssr-write`, deliberately** — that page
needs a freshly started server per case, and a nav link would invite clicking into it
mid-session and silently contaminating the run. It is reachable by typed URL only.

The nav also carries `data-sveltekit-reload`, so every lane switch is a real page load.
Without it these are client-side navigations, the app never remounts, and switching to a
lane with a different init signature trips the guard in `initLangsys` and renders
"Init failed" — which reads as a broken testbed rather than the singleton behaving as
documented. The in-page links under `/e2e/nav` must **not** carry it: those navigations
are the thing under test.

Phrases are deterministic with a `?run=<id>` override. Re-running the same id exercises
the registered-but-untranslated (`null`) case instead of a fresh miss — which is itself
worth testing, since a truthiness check there re-reports content that is already known.
