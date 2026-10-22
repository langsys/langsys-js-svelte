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
CORE_SHA=48910e8205e3f5e67a8b529801cd830860bde545     # the "Core under test" row
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
npm test -- --run        # 372 tests, no network
npm run check            # 0 errors
```

## 2. Two ways to run the testbed

- **Against an SDK test clone** — a local Langsys seeded for the SDKs, reached through the
  contract fixture's forwarder, which `node _dev_/contract/clone.mjs --serve` starts with every
  case named, printing each case's project and keys. No `.env`; the clone's environment and its
  reseed are in [`contract/README.md`](./contract/README.md). The VAR pages (`/fixture/var`,
  `/fixture/var-plain`) and the request-scope page (`/e2e/srv-scope`) run this way, each page
  naming its case's `project` and `key` in its query. A case's writes stay until the next reseed,
  so reseed before an automated run.
- **Against a local Langsys** — the demo at `/` and the `/e2e/*` routes, with a `.env` per
  `.env.example`. See [`e2e/README.md`](./e2e/README.md) for keys and seeding.

The build-time transform is applied to `/fixture/var`, `/fixture/gate10` and
`src/ssr-measure/var` only (`varTransform` in `vite.config.ts`), so every other route shows the
package without it. In an app it is one line in `svelte.config.js`: README.md, _Variables in
text — the build-time transform_.

## 3. Placeholders, blocks and ids, server rendering

```bash
node _dev_/contract/clone.mjs --serve                               # terminal 1: the forwarder on :8787
SRV_API=http://127.0.0.1:8787/api SRV_PROJECT=76000301-0000-4000-8000-000000000001 \
  SRV_KEY=svelte-03-01-write LANGSYS_FX_PORT=8787 npm run dev        # terminal 2, freshly started
```

Start the forwarder before the dev server's first request: the server initialises the SDK once, on
that request. Case 2.1's project (`76000201-…`, read key `svelte-02-01-read`) holds the VAR
catalog, `en-us` → `it-it`; case 2.2's (`76000202-…`, write key `svelte-02-02-write`) starts empty.

Open **`http://127.0.0.1:5173/fixture/var?locale=it-it&user=Ana&project=76000201-0000-4000-8000-000000000001&key=svelte-02-01-read`**:

| Feature                   | What you see                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Translated on the server  | `Ciao Ana, bentornato` and `Hai 3 articoli` are in the page source (`curl` the URL), not only after hydration.         |
| Block ids                 | In the source, each block's host carries `data-ls-contentblock="<id>"` and `data-ls-resolved="it-it"`.                 |
| One phrase for every user | Change `user=Ana` to `user=Luis`: the same catalog entry renders `Ciao Luis, bentornato`.                              |
| Plurals stay numeric      | `&n=1` gives `Hai 1 articolo`; `&n=5` gives `Hai 5 articoli`.                                                          |
| Handlers survive          | **Add one** still adds: the count goes up.                                                                             |
| `{#await}` is a fallback  | The source shows `Loading…`, and its host has no `data-ls-resolved`; after hydration it reads `Loaded after a moment`. |
| Accept-Language helper    | The last line reads `Accept-Language: it-it`; without `locale=` it reads `en-us`.                                      |

Then what registered, in case 2.2's project, which starts empty, so that everything it holds
afterwards was registered by the page. A server render alone registers: `curl` the page once with
`user=Zoe` (no `locale=`, the base language, so misses register) and read the catalog below —
`Hello {name}, welcome back` is there within a few seconds, with no browser involved and no `Zoe`
anywhere.

```bash
P=76000202-0000-4000-8000-000000000001 K=svelte-02-02-write
curl -s "http://127.0.0.1:5173/fixture/var?user=Zoe&project=$P&key=$K" > /dev/null
curl -s -H "x-authorization: $K" "http://127.0.0.1:8787/api/translations?project_id=$P&locale=it-it" | jq '[.data[] | to_entries[] | if (.value | type) == "object" then (.value | keys[]) else .key end]'
```

Then open the same page **without** `locale=` as two users, wait about 30 s for the browser's
flush, and read the catalog again:

- `Hello {name}, welcome back` appears once, and no other phrase carries a user's name.
  (`Layout phrase 0` is the fixture layout's own `$t`.)
- `You have {items_count} items` is the count's derived placeholder.
- Each block's stored content holds a placeholder where its value was: `{items_count}` in the cart
  block the server sends, and `{name}` in the block only the browser renders (`Shown in the browser
to {name}`). The project's owner reads it: `GET /api/translatable-items/{id}` with
  `Authorization: Bearer 112021|svelte-token-112021` and `x-device-id: svelte-device-112021`, for
  each `content_block` row of `GET /api/translations/data?project_id=$P&locale=it-it`.
- `From the CMS, section one` registers: a block whose only dynamic part is `{@html}` is content.
- Nothing from the `{#each}` list, the `{#await}` block, or the block mixing `{@html}` with a name.

## 4. Without the transform

Same servers. Open
**`http://127.0.0.1:5173/fixture/var-plain?project=76000202-0000-4000-8000-000000000001&key=svelte-02-02-write&debug=1`**
and the browser console:

- The notice: _A `<Translate>` or `<Phrase>` registers nothing (svelte-transform-missing: add
  langsysPreprocess() from langsys-js-svelte/preprocess to svelte.config.js)…_
- The catalog gains nothing from the page's blocks, for any user. (`Layout phrase 0`, the fixture
  layout's own `$t`, registers as it does on every page.)
- In case 2.1's project, with `&locale=it-it`, the catalogued translation still renders:
  `Ciao Ana, bentornato`.

## 5. Request scope and the hydration seed (`$t`)

The commands are in [`e2e/README.md`](./e2e/README.md), _SRV-7 — the request scope_ (start the dev
server with `SRV_SEAM=core`). By hand:

- `curl 'http://127.0.0.1:5173/e2e/srv-scope?locale=it-it'` serves the Italian text, with
  `window.__LANGSYS_SEED__` in the page.
- In a browser the page keeps the served Italian after hydration; with `&noseed=1` it re-renders
  to the source, which is what the seed prevents.

## 6. Hints

Discovery hints are stored for read-only sessions, and are checked two ways:

- **SDK test clone:** `LANGSYS_FX_PORT=8787 npm run dev` (fresh), then
  `node _dev_/contract/verify-contract.mjs`: a layout that stays mounted across a client-side
  navigation records its miss for the new page, read from the hints the clone stored.
- **Local Langsys:** `node --env-file=.env _dev_/e2e/verify.mjs`, TEST 10 (hint URL attribution).

## 7. Running without credentials

`npm run dev` (fresh), then open **`http://127.0.0.1:5173/fixture/var?key=&require=1`**: no key,
and `requireCredentials` on.

- The page shows every block's text as written.
- The browser console shows a `LangsysConfigurationError` for each block that registers, including
  those mounted before the layout called `init()`. Without `&require=1` there are none.
- `node _dev_/e2e/credentials.mjs` checks the same, that the page without `&require=1` raises
  nothing, and that `/fixture/var-plain`, whose blocks only read, raises nothing either.

## 8. A locale switch overtaken by another

`LANGSYS_FX_PORT=8787 npm run dev` (fresh), then `node _dev_/e2e/locale-race.mjs`, against an SDK
test clone. It picks one locale and, before its
catalog arrives, another. A slow French overtaken by a German that fails leaves the source text and
stores nothing under `de-de`; a slow Italian overtaken by a Portuguese that succeeds shows `Olá`.

## 9. Everything at once

The full run, each suite on a freshly started server, is the command block in `CONFORMANCE.md` under
_Evidence — and re-running it_. On the core above every suite passes: unit 372, transport seam 31,
live E2E 61, Svelte DOM 17, SRV concurrency 6, SRV-7 scope 9, running without credentials 8; and
on the SDK test clone, contract unit 9, HINT-13 12, VAR 42, hydration 11, SRV-3 flush 6 + 6,
locale race 4.
