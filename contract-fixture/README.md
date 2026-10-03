# Langsys API contract double

A runnable HTTP double of the Langsys API for conformance tests (spec CONF-2). Every SDK's
tests start it and point their API base URL at it. It is one implementation for the whole
fleet: other SDKs vendor this directory and cite it by git blob, the same way they vendor the
shared vector files.

It exists because a test that asserts on what an SDK *sent* cannot fail when the server
refuses it. This double can say no, and it holds state, so a test asserts on what the server
*accepted* by reading it back.

## Running it

```sh
node contract-fixture/server.mjs            # ephemeral port on 127.0.0.1
node contract-fixture/server.mjs --port 8787
```

It prints one line when ready:

```json
{"ready":true,"base_url":"http://127.0.0.1:PORT/api","fixture_url":"http://127.0.0.1:PORT/__fixture"}
```

Point the SDK at `base_url`. Node 18 or later; no dependencies.

## Routes

The real API routes an SDK calls:

| Route | Behaviour |
|---|---|
| `GET /api/authorize-project/{project}` | Key type, computed `write_enabled`, `auto_discovery`, the project's `discovery_base_locale_only`, the batch limit in `langsys_settings.translatable_items.batch_limit`. |
| `GET /api/translations`, `GET /api/translations/data` | The flat catalog for `project_id` and `locale`, with `write_enabled` and `discovery_base_locale_only` as top-level siblings of `data`. An empty project answers `data: []`. |
| `POST /api/translatable-items` | Registers phrases and content blocks, and stores the translations sent with phrases. `200 {status:true, data:{human_translations_saved, human_translations_skipped}}` on success. |
| `POST /api/discovery/hint` | Always `204` once past the rate limit and URL validation. |

And a setup namespace:

| Route | Behaviour |
|---|---|
| `POST /__fixture/seed` | Replaces the whole state with a seed document (`seed.schema.json`). |
| `POST /__fixture/reset` | Empties the state. |
| `POST /__fixture/clock` | `{"advance_seconds": N}` moves the double's clock forward, for grant expiry and hint dedup. |
| `GET /__fixture/state` | Accepted state only: registered phrases and blocks, and accepted hints. |

There is no route that returns what the double received, by design. A write is observable
only as the state it left behind. A request the double refused leaves no trace in the state,
so the state cannot be used to count attempts.

## What it enforces

The contract is derived from the backend's own code, and its checks run in the backend's
order. On the catalog and registration routes (`GET /translations`, `GET /translations/data`,
`POST /translatable-items`):

1. **Authentication** — no `X-Authorization` answers `401`.
2. **Request binding** — an unknown `project_id` answers `404`, before the key is looked at.
3. **Duplicate requests** — only for a key seeded with `duplicate_guard`: the fourth identical
   request within the window answers `429`.
4. **API-key authorization** — an unknown key, or a key with no project, answers `403`. A
   suspended project answers a `write` key `402` and any other key `403`. A non-GET request
   from a session that may not write answers `403`, **before** the batch-size check, so a
   read-only session sending an over-limit batch gets `403`, not `422`.
5. **Batch size** — more than `batch_limit` items answers `422`.
6. **Locale** — on the catalog, a missing `locale` answers `422`.
7. **Usage balance** — a key seeded with `usage_exhausted` answers `402`.
8. **Request validation** — a missing `project_id`, or `translatable_items` that is not a list,
   answers `422`, both in one response when both fail.
9. **Project access** — a key used against another project answers `403`.
10. **Translation locales** — on `POST /translatable-items`, a `translations` key that is not one
    of the project's target locales (the base locale included) answers `422` before anything is
    written, with one entry on `translatable_items.<index>.translations`, code `invalid_option`.

`GET /authorize-project/{project}` runs binding (`404`), duplicate requests, API-key
authorization (where a missing key is the `401`), the usage balance, and then answers a key for
another project `403`. `POST /discovery/hint` runs only its rate limit and the validation of
`page_url`; no key is checked.

**`write_enabled` is computed, never seeded.** A `write` key may write. An `ip_write` key may
write when the source address is in its allow-list or in `renderer_egress_ips`. Any key may
write with a valid `X-Write-Grant`: an HS256 JWT signed with the key's `write_grant_secret`,
carrying `exp` (60 seconds of leeway) and a non-empty `sub`. Tests connect from `127.0.0.1`.

**Input is cleaned as the backend cleans it:** strings are trimmed and empty strings become
`null`, before anything else reads them.

**Registration skips rather than rejects.** A phrase with empty text, or with the category
`__uncategorized__`, is skipped; a content block with no phrase text is skipped. Everything
else registers, and re-sending an item is idempotent. A registered phrase reads back as
present with a `null` translation; a registered block reads back as an object whose phrases
are `null`.

A content block with no category registers, and the flat catalog serves it under
`__uncategorized__`, the key uncategorised phrases use. The literal `__uncategorized__` is
never accepted as a category on registration, so the key only ever appears on the read side.
The seed option `drop_uncategorized_blocks` reproduces the backend's former behaviour, which
answered `200` and stored nothing, for a regression test.

**Translations sent with phrases are stored as human translations** (`ProvidedTranslationService`).
A phrase item may carry `translations`, keyed by target locale; locales are compared as the
backend formats them (`_` to `-`, lowercased). Each is stored on the registered phrase and
served on later catalog reads. Content blocks, phrases sent with `translatable: false`, and
items that registered nothing ignore the map. A new translation costs its phrase's words
against the project's `human_translation_word_limit` (null, the default, is uncapped); one that
would cost more than is left is skipped and counted in `human_translations_skipped`, and its
locale stays untranslated. Replacing a translation the phrase already has is an update and
costs nothing. A translation with no text is counted as saved and writes nothing, as the
backend's `createTranslation` does with empty text. The words used are in
`GET /__fixture/state` as `human_translation_words_used`.

**Hints are accepted by the backend's rules, in its order.** The request is limited per source
address (`hint_rate_per_minute`, `429`) and its `page_url` must be a URL of at most 2048
characters (`422`). After that the answer is `204` in every case, including for an unknown
key, and the hint is stored only if it passes every check: the caller cannot write; the key
may report (`report_discovered_content`); the caller is not a renderer egress address; the
key is `ip_write` and renderer egress addresses are configured; the URL normalises; the same
key has not reported the same URL within `hint_dedup_ttl_seconds`; the page is on the
project's `website_url` host or a subdomain; the project machine-translates new content and
has target locales; the project has credits. URLs are normalised as the backend does: scheme
and host lowercased, tracking parameters and every `utm_*` dropped, parameters sorted, and a
fragment kept only when it is a route (`#/…` or `#!/…`).

## Not modelled

- **The sensitive-URL check on hints.** The backend declines a hint whose URL carries
  credential-shaped parameters. SDKs decline those URLs before sending, and no conformance
  row depends on the server's own check, so the double stores such a hint if it otherwise
  qualifies.
- **App attestation** (`X-App-Attestation`), an arm of the write decision for mobile SDKs.
- **Machine translation.** Translations exist only where the seed or a provided translation
  supplies them. So the backend's exemption of a translation that post-edits a machine
  translation the organization already paid for is not modelled: in the double, only an
  existing translation exempts a provided one from the quota.
- **Parts of the backend's request handling that every seed and lane would trip over**:
  project ids that are not UUIDs (`422 invalid_format` in the backend; seeds use ids like
  `p1`), request fields a route does not declare (`422 not_allowed`), the general
  `throttle:api` limit of 120 requests a minute, a locale that is not one of the project's
  (`422`), the same routes served without the `/api` prefix, and the `Retry-After` and
  `X-RateLimit-*` headers on a `429`.
- **Routes outside the conformance contract**, such as the locale display data an SDK may
  request at start-up (`/locales/{locale}/data`). They answer `404`.
- **Word counts** in the catalog envelope count whitespace-separated words, which is close to
  the backend's count and never asserted on.

## Faults

A seed may carry `faults`: deterministic failures matched by method and route path and
consumed in order, before any other handling. A fault answers a status, drops the connection,
or delays the response. They model the network and infrastructure, for retry, backoff and
degradation tests.

## Error bodies

Every error carries the backend's envelope, as langsys main `17a191cd` renders it:
`{status:false, error:{message, code, template[, params][, details][, errors]}}`. A plain
error's `template` is its message. Assert on the status, on `error.code`, on an entry's
`field` and `code`, and on state read back, never on message text.

| Status | `error.code` | When |
|---|---|---|
| `401` | `unauthenticated` | No `X-Authorization`. On the catalog and registration routes it comes first, before the project lookup. |
| `402` | `subscription_suspended` | A suspended project, to a `write` key. |
| `402` | `api_units_limit_exceeded` | A key seeded with `usage_exhausted`. |
| `403` | `api_key_invalid` | An unknown key, a key with no project, or, on `authorize-project`, a key for another project. |
| `403` | `project_unavailable` | A suspended project, to any key but a `write` key. |
| `403` | `api_key_write_not_allowed` | A write from a session that may not write. |
| `403` | `forbidden` | A key for another project, on the catalog and registration routes. |
| `404` | `not_found` | An unknown project (before the key is checked), or an unknown route. |
| `405` | `method_not_allowed` | A known route with the wrong method. |
| `422` | `batch_size_exceeded` | More than `batch_limit` items, with `details:{limit, item_count}`. |
| `422` | `validation_failed` | One entry per failed rule in `errors`: `locale` `invalid_option` (missing locale on the catalog), `project_id` `required`, `translatable_items` `invalid_type`, `translatable_items.<i>.translations` `invalid_option` (a locale that is not a target), and `page_url` `required`, `invalid_type`, `invalid_format` or `too_long` (`params:{max:2048}`). |
| `429` | `duplicate_request` | The duplicate-request guard. |
| `429` | `too_many_requests` | The hint rate limit. |

A body that is not JSON is read as empty, as the backend reads it, so the route's own
validation answers. An injected `status` fault answers with the case the backend maps that
status to (`bad_request`, `payment_required`, `conflict`, `gone`, `unprocessable_entity`,
`internal_error`, `external_service_error`, `service_unavailable`, or one of the codes above),
and any other status with `internal_error`.
