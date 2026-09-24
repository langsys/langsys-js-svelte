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
| `POST /api/translatable-items` | Registers phrases and content blocks. `200 {status:true}` on success. |
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
order:

1. **Duplicate requests** — only for a key seeded with `duplicate_guard`: the fourth identical
   request within the window answers `429`.
2. **API-key authorization** — no `X-Authorization` answers `401`; an unknown key, or a key
   with no project, `403`; a suspended subscription `402`. A non-GET request from a session
   that may not write answers `403`, **before** the batch-size check, so a read-only session
   sending an over-limit batch gets `403`, not `422`.
3. **Batch size** — more than `batch_limit` items answers `422`.
4. **Request binding** — an unknown project answers `404`.
5. **Usage balance** — a key seeded with `usage_exhausted` answers `402`.
6. **Project access** — a key used against another project answers `403`.

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
- **Machine translation.** Translations exist only where the seed supplies them.
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

Errors carry `{status:false, data:[], error:"…"}`, and `401` and `429` carry `{message}`, as
the backend does today. Assert on the status and on state read back, never on the error text:
the backend is replacing the string with a structured error object.
