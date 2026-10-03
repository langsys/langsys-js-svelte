# Testing this branch locally

Dev-only; `_dev_/` does not ship. This page is the by-hand tour: one visible check per feature.
The automated suites behind each feature are listed in `CONFORMANCE.md` under _Evidence — and
re-running it_, and the harness details are in [`e2e/README.md`](./e2e/README.md).

You need Node 18+ and Chromium for the harnesses (`npx playwright install chromium`, once).

## 1. Link the core this branch needs

This branch uses core API that is not on npm yet: the published `langsys-js-typescript@0.6.5`
predates it, so a plain `npm install` gives you a core that cannot run this code. Build the core
at the SHA in `CONFORMANCE.md`'s **Core under test** row and link it in place:

```bash
CORE_SHA=ab408561802086aadc85b16510379ba0b1cbcec5     # the "Core under test" row
git -C ../langsys-js-typescript fetch origin
git -C ../langsys-js-typescript worktree add --detach /tmp/langsys-core $CORE_SHA
(cd /tmp/langsys-core && npm ci && npm run build)

rm -rf node_modules/langsys-js-typescript
ln -s /tmp/langsys-core node_modules/langsys-js-typescript
```

A clean worktree, not `../langsys-js-typescript` itself: the shared checkout may carry another
lane's uncommitted work. `npm install` replaces the link with the registry version, so run the two
link lines again after any install.

Check it took:

```bash
npm test -- --run        # 268 tests, no network
npm run check            # 0 errors
```

## 2. Two ways to run the testbed

- **Against the contract double** — `contract-fixture/`, a local stand-in for the Langsys API.
  No account, no `.env`. The VAR pages (`/fixture/var`, `/fixture/var-plain`) and the
  request-scope page (`/e2e/srv-scope`) run this way.
- **Against a local Langsys** — the demo at `/` and the `/e2e/*` routes, with a `.env` per
  `.env.example`. See [`e2e/README.md`](./e2e/README.md) for keys and seeding.

The build-time transform is applied to `/fixture/var`, `/fixture/gate10` and
`src/ssr-measure/var` only (`varTransform` in `vite.config.ts`), so every other route shows the
package without it. In an app it is one line in `svelte.config.js`: README.md, _Variables in
text — the build-time transform_.

## 3. Placeholders, blocks and ids, server rendering

```bash
node _dev_/e2e/var.mjs --serve                                      # terminal 1: the double on :8787
node _dev_/e2e/var.mjs --seed                                       # its catalog: en-us → it-it
SRV_API=http://127.0.0.1:8787/api SRV_KEY=k-write npm run dev       # terminal 2, freshly started
```

Seed before the dev server's first request: the server initialises the SDK once, on that request.

Open **`http://127.0.0.1:5173/fixture/var?locale=it-it&key=k-write&user=Ana`**:

| Feature                   | What you see                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Translated on the server  | `Ciao Ana, bentornato` and `Hai 3 articoli` are in the page source (`curl` the URL), not only after hydration.         |
| Block ids                 | In the source, each block's host carries `data-ls-contentblock="<id>"` and `data-ls-resolved="it-it"`.                 |
| One phrase for every user | Change `user=Ana` to `user=Luis`: the same catalog entry renders `Ciao Luis, bentornato`.                              |
| Plurals stay numeric      | `&n=1` gives `Hai 1 articolo`; `&n=5` gives `Hai 5 articoli`.                                                          |
| Handlers survive          | **Add one** still adds: the count goes up.                                                                             |
| `{#await}` is a fallback  | The source shows `Loading…`, and its host has no `data-ls-resolved`; after hydration it reads `Loaded after a moment`. |
| Accept-Language helper    | The last line reads `Accept-Language: it-it`; without `locale=` it reads `en-us`.                                      |

Then what registered. Open the same page **without** `locale=` (base language, so misses
register) as two users, wait about 30 s for the browser's flush, and read the double's state:

```bash
curl -s http://127.0.0.1:8787/__fixture/state | jq '.projects.p1 | [.phrases[].phrase, (.blocks[].phrases[].phrase)]'
```

- `Hello {name}, welcome back` appears once, and no other phrase carries a user's name. (The seed
  itself holds `Hello Ana, welcome back`: the catalogued translation section 4 renders. `Layout
phrase 0` is the fixture layout's own `$t`.)
- `You have {items_count} items` is the count's derived placeholder.
- `From the CMS, section one` registers: a block whose only dynamic part is `{@html}` is content.
- Nothing from the `{#each}` list, the `{#await}` block, or the block mixing `{@html}` with a name.

A server render alone registers too: `curl` the page once with `user=Zoe` and read the state —
the placeholder phrase is there within a few seconds, with no browser involved.

## 4. Without the transform

Same servers. Open **`http://127.0.0.1:5173/fixture/var-plain?key=k-write&debug=1`** and the
browser console:

- The notice: _A `<Translate>` or `<Phrase>` registers nothing (svelte-transform-missing: add
  langsysPreprocess() from langsys-js-svelte/preprocess to svelte.config.js)…_
- The double's state gains nothing from this page, for any user.
- With `&locale=it-it` the catalogued translation still renders: `Ciao Ana, bentornato`.

## 5. Request scope and the hydration seed (`$t`)

The commands are in [`e2e/README.md`](./e2e/README.md), _SRV-7 — the request scope_ (start the dev
server with `SRV_SEAM=core`). By hand:

- `curl 'http://127.0.0.1:5173/e2e/srv-scope?locale=it-it'` serves the Italian text, with
  `window.__LANGSYS_SEED__` in the page.
- In a browser the page keeps the served Italian after hydration; with `&noseed=1` it re-renders
  to the source, which is what the seed prevents.

## 6. Hints

Discovery hints are stored for read-only sessions, and are checked two ways:

- **Contract double:** `npm run dev` (fresh), then `node _dev_/contract/verify-contract.mjs` —
  the `HINT-13` lines: a layout that stays mounted across a client-side navigation records its
  miss for the new page.
- **Local Langsys:** `node --env-file=.env _dev_/e2e/verify.mjs`, TEST 10 (hint URL attribution).

## 7. Everything at once

The full run, each suite on a freshly started server, is the command block in `CONFORMANCE.md`
under _Evidence — and re-running it_. On the core above every suite passes: unit 268, VAR 18,
contract 22, live E2E 61, Svelte DOM 17, SRV concurrency 6, SRV-7 scope 9, SRV-3 flush 6 + 6.
