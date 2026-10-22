# Langsys API contract fixture

The contract fixture of the Langsys SDK fleet (spec CONF-2): a real Langsys API on an SDK test
clone, seeded before the run, which every SDK's contract tests reach through `forwarder.mjs`. It
is one implementation for the whole fleet: other SDKs vendor this directory and cite it by git
tree.

It exists because a test that asserts on what an SDK *sent* cannot fail when the server refuses
it. The API says no, and it holds state, so a test asserts on what it *accepted* by reading it
back through the API's own routes.

## The clone

An SDK test clone is a local Langsys instance running the product's code, with a langsys-ai of
its own that serves machine translation from a cache (langsys `docs/sdk-test-clone.md`). Of code
written for tests it runs only its seeders, and everything else about it is its `.env`:

- **It is seeded before the run** from seed files kept beside each SDK's tests. The clone's
  `SDK_TEST_SEED_PATHS` names the folders, and its seeder reads every `*.json` file in them, at any
  depth. A seed document is `{projects, keys}`; its fields are in `docs/sdk-test-clone.md`.
- **Ids are fixed.** Project and key ids, raw keys and user token ids are written in the seed
  files, unique across every SDK's folders, each SDK in ranges of its own. A test knows every id it
  uses without asking, and the forwarder passes them through as sent.
- **Every test case has projects of its own**, so no case reads another's writes, whatever order
  the cases run in, and a test runs again only after a reseed. Before a case acts, the test helper
  reads its world back as each project's owner: the keys on every field the key listing returns,
  the project's settings, a catalog holding exactly the seeded phrases and blocks with their
  translations, each block's markup, and no stored hints. A world that differs fails its case as
  `seed not landed`, naming what differs.
- **The server's settings are the clone's `.env`**, one set for the whole run: the batch limit,
  the hint rate per address, the hint dedup window and the renderer's egress address.
- **One refused seed file stops the reseed for every SDK sharing the clone**, so a changed file is
  checked against the seeder before it is written, and a reseed runs only while no other suite
  does, since it rebuilds the clone for all of them.

Before a run both instances are reseeded, each until it exits 0:

```sh
php ~/Documents/dev/langsys5/tests/Sdk/reseed.php                          # clears the clone's cache, then migrate:fresh --seed
(cd ~/Documents/dev/langsys-ai-5 && php artisan migrate:fresh --seed --force)
```

## Running the forwarder

```sh
NODE_EXTRA_CA_CERTS=~/.config/valet/CA/LaravelValetCASelfSigned.pem \
  node contract-fixture/forwarder.mjs --target https://api.langsys5.test \
    --clone-root ~/Documents/dev/langsys5 [--php php] [--port N] [--log FILE]
```

`--target` is the clone's origin and `--clone-root` its langsys checkout, whose
`tests/Sdk/accepted-hints.php` reads back the hints the clone stored. A clone served over HTTPS by
a local CA needs that CA in `NODE_EXTRA_CA_CERTS`. It prints one line when ready:

```json
{"ready":true,"base_url":"http://127.0.0.1:PORT/api","fixture_url":"http://127.0.0.1:PORT/__fixture"}
```

Point the SDK at `base_url`. Node 18 or later; no dependencies. At start it asks the checkout's
reader for a project nothing uses and the target for a catalog with no key, and it exits 2 unless
the reader answers no hints and the target answers `401 unauthenticated`, as a Langsys API does.
`--log` appends one JSON line for its start, each setup, each request refused for naming no case,
each locale list refused as unsupported, and each failed read.

The TypeScript suite always takes this path: `tests/helpers/contract-fixture.ts` starts the
forwarder from `LANGSYS_CONTRACT_TARGET` and `LANGSYS_CONTRACT_CLONE_ROOT`, and throws when either
is missing, so a contract test never passes by skipping. `LANGSYS_CONTRACT_LOG` names the log
file. The vitest config gives each case and hook the time a real API takes:

```sh
LANGSYS_CONTRACT_TARGET=https://api.langsys5.test \
LANGSYS_CONTRACT_CLONE_ROOT=~/Documents/dev/langsys5 \
NODE_EXTRA_CA_CERTS=~/.config/valet/CA/LaravelValetCASelfSigned.pem npm test
```

## Test cases

A test case tells the forwarder what it adds to the clone with `POST /__fixture/setup`
(`setup.schema.json`):

```json
{"keys": ["ts-api-1-k-write"], "projects": ["75000100-0001-4000-8000-000000000000"],
 "tokens": ["100001|…"], "caller": "10.75.2.1", "faults": [], "reference": null}
```

- **A setup names its case** by the keys, projects and seeded user tokens it was seeded with, and
  gives it a caller address, faults and crafted reference lists. Nothing in it reaches the clone.
- **A setup naming a key, project or token of an existing case updates that case**: the fields it
  gives replace the case's, and the rest stay. A new case needs its caller. A setup that names no
  case, names two, carries a field the schema does not declare, or gives a caller that is not an IP
  address, or malformed lists, is refused with `400`.
- **A request belongs to the case** whose key (`X-Authorization`), user token
  (`Authorization: Bearer`) or project (the `authorize-project` path, or `project_id` in the query
  or a JSON body) it carries, looked for in that order, whichever process sends it.
- **A request that names no case is refused** with `421` and a body of the forwarder's own,
  `{"ok":false,"fixture":"no_case","route":"GET /api/translations",…}`, and nothing reaches the
  clone. A fetch client sends a request answered `421` once more, on a new connection, as the
  Fetch standard says, so the forwarder sees and refuses it twice.
- **Each case's requests reach the clone from its caller address**, sent as `X-Forwarded-For`,
  which the clone trusts from loopback; the forwarder sets it over any the request carried. Every
  limit the API counts per address (the `api` throttle, the hint rate) counts per case, and the
  address is the one an `ip_write` key's allow-list is checked against. A session that learns its
  capability and then sees it change is a case moved to another address with a setup.

## Routes

| Route | Behaviour |
|---|---|
| `/api/*` | Forwarded to the clone as sent, under the case's caller address; the clone's answer is relayed, its status, headers and body, and a connection it drops is dropped. |
| `POST /__fixture/setup` | Names a case, or updates one (above). |
| `GET /__fixture/state?project=<id>[&project=<id>]` | `{"hints":[{"project_id","url"}]}`: the hints the clone accepted for those projects, each URL as it was stored, in the order they were accepted, as the reader prints them. `400` when no project is named, and `502` with the reader's reason when it fails. |
| `POST /__fixture/clock` | `{"advance_seconds": N}` waits that long: the clone's clock is real. |

There is no route that returns what the forwarder received, by design. A test observes a write as
what the API serves afterwards: the catalog (`GET /translations`), the rows of
`GET /translations/data`, and a block's stored content, which `GET /translatable-items/{id}`
returns to the project's seeded user. The accepted hints are the only result no route returns.

## Faults

A case's `faults` fail its next matching requests, in order, before anything is forwarded: each
names a method and a route path after `/api`, without the query, and is consumed `times` times
(default 1). A fault answers a `status` with the error body the backend renders for it, drops the
connection (`drop`), holds the request for `delay_ms` first (with nothing else, the request is
then forwarded), or answers a raw `body` with its `status` (default `200`) and `content_type`, as
something in front of the API would: a proxy's error page, a captive portal. They model the
network and infrastructure, for retry, backoff and degradation tests, and apply to that case
only.

## Crafted reference lists

A case's `reference` holds Locale, Country, DialCode and Currency tables of its own, in table
order, with its organisation's `locale_code_format` beside them, since a clone's reference tables
are shared by every test. Once the clone has accepted a
request on a reference route, the forwarder answers it from the case's tables
(`reference-lists.mjs`), as LocaleController, CountryController and CurrencyController answer
from the API's own, ported; a request the clone refuses is refused as the clone refuses it. Names
are never given: each route names its rows in the display locale, so each display locale answers
its own list, `Español (Costa Rica)` in `es-es` and `Spanish (Costa Rica)` in `en-us`, and a test
asserts which list came back.

**Display locales are named as the backend names them**, through ICU as PHP's `\Locale` reads it
and Symfony Intl. A display locale is a language, then a script, a region and variants
(`sr-latn-ba`, `en-us-posix`), the shape every SDK sends. ICU reads `_` as `-` (`es_ES` is
`es-es`), and its root locale, `und` or any locale whose language is `root` (`root_ES` too),
names a region by its code and a locale by its subtags (`es (ES)`); `und` with more subtags
(`und_ES`) has no language and is not root. A display locale ICU has no data for falls back to the
host's default locale; the lists model a backend host whose default is English, which is PHP's
`en_US_POSIX` with nothing set, so such a locale is answered in English whatever the forwarder's
host's locale.

**Query keys are read as PHP's `parse_str` reads them**, leading spaces dropped: a key with a
bracketed part by the name before the bracket (`locales[a]` is `locales`), and in a name `.`, a
space and an unclosed `[` as `_` (`append.target_locales` is `append_target_locales`). A key with
no name (`=1`, `[x]`) is dropped. Each value is trimmed and an empty one is null, as TrimStrings
and ConvertEmptyStringsToNull make it. A field given twice takes its last value, and `locales` the
shape of its last key: a list when it has a bracket, started anew if `locales` was not one, whose
index is a key as PHP keys an array (`[]` the index after the highest so far, `[0]` or `[a]` that
index, so a repeated index keeps its last value), and otherwise a string, which lists nothing.

- **The three locale forms** (`/locales`, `/locales/flat`, `/locales/data`) take their display
  locales as `locales[]`, each formatted as the backend formats a locale, `_` read as `-` and
  lowercased. Only the codes the case's Locale table holds are named, in the table's order. The
  API appends the project's target locales unless `append_target_locales` is `false` or `0`, and
  always with a `project_id`; only the clone holds those, so a request that would append them is
  refused with `501` and a body of the forwarder's own,
  `{"ok":false,"fixture":"unsupported","route":"GET /api/locales/flat",…}`, which names what to
  send instead. Each entry is keyed, and every `code` in it written, in the
  `locale_code_format` (`lowercase-hyphen`, `bcp47` or `posix`: `es-es`, `es-ES`, `es_ES`). The
  grouped form groups by language name, groups and rows in byte order; the flat form is by name and
  the data form by locale name. An answer naming nothing is `data: []`, as PHP writes an empty map.
- **Countries** are `{label, code, eu}` by label, **dial codes** `{country_code, dial_code, name}`
  by name, the name carrying the code as `Spain (+34)`, and **currencies** `{code, name, symbol,
  symbol_native, decimal_digits, rounding}` in table order, each row as given or with the stored
  defaults. A currency is named as Symfony Intl's `Currencies::getName` names it for
  CurrencyController, which turns the display locale's `-` into `_` and keeps its case. Symfony
  resolves a locale alias, reads that locale's currency bundle if it has one, matched
  case-sensitively as on the backend's Linux hosts, and otherwise falls back: a locale drops its
  last subtag as PHP's `locale_parse` reads it, a one-subtag locale of two or three letters falls
  back to `en`, `en` to `root`, and any other ends the chain. The first bundle on the way that holds
  the currency names it, in ICU's name for it in that bundle's locale, and `root` by its code. So
  `zh-tw` reads `zh_tw`, which has neither a bundle nor an alias (Symfony's is `zh_TW`), and is
  named in `zh`; `pt-pt` is named in `pt`, `sr-latn-ba` in `sr_Latn`, `nb` and `tl` in `en`, and
  `iw-il` in `he`. `symfony-intl.json` holds the bundles, the currencies each holds, and the
  aliases, from the symfony/intl langsys locks. Where Symfony throws a MissingResourceException,
  for a currency no bundle on the chain holds, the stored name is kept. Where it throws a
  ValueError, which the controller does not catch, for `und` with two or more subtags after it
  (`und-latn-es`), the route answers `500 internal_error`.

What the crafted lists do not model:

- **A display locale with an extension or private-use subtag** (`-u-ca-gregory`, `-x-foo`), which
  PHP's ICU parses by rules of its own; the lists read those subtags as variants.
- **A nested index** (`locales[a][b]`), read as one value where the backend holds a list in it.
- **The list routes' `page`, `records_per_page`, `order_by` and `filter_by`**: the crafted lists
  answer whole, in their default order.
- **PHP's ICU data.** The names are Node's ICU, which can word a name differently from the
  backend's, and can lack one Symfony's newer data holds (the currency `XCG`, the locale
  `kk_Arab`), which it then names in English or by its code; assert on which display locale's list
  came back, not on a name's exact wording.

## Error bodies

On `/api`, every answer is the clone's but four. Two carry a body of the forwarder's own, naming
the route: a request naming no case (`421`, above) and a locale list that would append target
locales (`501`, above). Two carry the backend's envelope, `{status:false, error:{message, code,
template}}`: a fault's `status`, which answers with the case the backend's
`ApiErrorService::forStatus` maps it to (`bad_request`, `unauthenticated`, `payment_required`,
`forbidden`, `not_found`, `method_not_allowed`, `conflict`, `gone`, `unprocessable_entity`,
`too_many_requests`, `internal_error`, `external_service_error`, `service_unavailable`, and
`internal_error` for any other status), and the crafted currency list's `500 internal_error`.
Assert on the status and on `error.code`, never on message text.
