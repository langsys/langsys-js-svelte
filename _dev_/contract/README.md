# Contract harness

Dev-only. This binding's contract suites (spec CONF-2) run against an **SDK test clone**: a local
Langsys instance running the product's code, with a langsys-ai of its own, seeded before the run
(langsys `docs/sdk-test-clone.md`). Every suite reaches it through `contract-fixture/forwarder.mjs`,
vendored byte-exact from langsys-js-typescript, and reads what the API **accepted** back through
the API's own routes: the catalog, a block's stored content as the project's owner reads it, and,
for the one result no route returns, the hints the clone stored.

## The world

- **`cases.mjs`** holds every case: one project or more of its own, with fixed ids, keys and a
  seeded user token, and the address its requests come from. This binding's ranges on the clone
  are ids `7600…`, raw keys `svelte-…`, user token ids 110000–119999 and addresses 10.76.0.0/16.
- **`seeds/`** is what the clone seeds from, one file per suite, written from `cases.mjs`:
  `node _dev_/contract/make-seeds.mjs` writes them and `--check` fails on any difference. The
  clone's `SDK_TEST_SEED_PATHS` names this folder, and one file the clone's seeder refuses stops the
  reseed for every SDK after it, so run `--check` before and after changing a case, and never leave
  the folder missing.
- **A run starts with a reseed** of both instances, and a case runs once per reseed: a test's
  writes stay until the next one. A reseed rebuilds the clone for every SDK sharing it, so it runs,
  with the suites after it, under `test-suite-lock run -- …`, which queues it behind any other run:

```bash
php ~/Documents/dev/langsys5/tests/Sdk/reseed.php                          # clears the clone's cache, then migrate:fresh --seed
(cd ~/Documents/dev/langsys-ai-5 && php artisan migrate:fresh --seed --force)
```

## Running the suites

Each harness starts the forwarder itself (`clone.mjs`), on `LANGSYS_FX_PORT` (8787), names every
case to it, and stops it at the end. The environment names the clone:

```bash
export LANGSYS_CONTRACT_TARGET=https://api.langsys5.test
export LANGSYS_CONTRACT_CLONE_ROOT=~/Documents/dev/langsys5
export NODE_EXTRA_CA_CERTS=~/.config/valet/CA/LaravelValetCASelfSigned.pem
export LANGSYS_FX_PORT=8787

LANGSYS_CONTRACT_SUITE=1 npx vitest run          # the *.contract.test.ts files: SRV-2 credentials, REF-1 lists

eval "$(node _dev_/e2e/srv-flush.mjs --env write)"
SRV_API=http://127.0.0.1:8787/api SRV_PROJECT=$SRV_PROJECT SRV_KEY=$SRV_KEY npm run dev     # fresh
node _dev_/e2e/srv-flush.mjs --expect write      # SRV-3
node _dev_/e2e/var.mjs                           # SRV-1, VAR-6, and corroboration for VAR-1, VAR-7, SRV-4
node _dev_/contract/srv-hydrate.mjs              # SRV-7, SRV-1
node _dev_/contract/verify-contract.mjs          # HINT-13
node _dev_/e2e/locale-race.mjs                   # CACHE-1, CACHE-2 through the binding
# restart the dev server with `--env read`'s values, then:
node _dev_/e2e/srv-flush.mjs --expect read
```

Without `LANGSYS_CONTRACT_TARGET` and `LANGSYS_CONTRACT_CLONE_ROOT` a harness throws, so none
passes by skipping, and `npm test` leaves the `*.contract.test.ts` files out.

By hand, `node _dev_/contract/clone.mjs --serve` starts the forwarder with every case named and
prints each case's project and keys, until ^C.

**The testbed** is `src/routes/fixture/`: a persistent `+layout.svelte` that calls
`syncNavigation()`, initialises the SDK with the `project` and `key` its query names, and holds
one phrase; pages `a` and `b` for the navigation; and the VAR pages. A VAR request's server render
runs under the same `project` and `key`, or `server_key` for another key of that project
(`src/hooks.server.ts`).

**Why the proxy.** The forwarder sends no CORS headers, so a page on the dev server cannot call
it directly. The testbed points `apiUrl` at `/__fx/api` on its own origin, and `vite.config.ts`
proxies `/__fx` to the forwarder, which routes each request to its case by the key it carries.

**`contract-fixture/` is vendored byte-exact** from langsys-js-typescript and cited by git tree
id in `CONFORMANCE.md`. Never edit or reformat it (it is in `.prettierignore` and eslint's
ignores); re-vendor it with `git -C ../langsys-js-typescript archive <sha> contract-fixture | tar -x`
after removing the old files.

**Mutations** run in a copy of the tree on another port (`E2E_BASE_URL=http://127.0.0.1:5175`),
each on cases fresh from a reseed: mutants on cases of their own share one, and the reseed and
every mutant after it run under one `test-suite-lock`. Prove the copy passes unmutated first: a copy Vite refuses to
serve, such as one whose symlinked `node_modules` is outside its allow list, fails every case and
reads as a red mutation.
