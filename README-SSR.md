# SSR Usage Guide

This guide shows how to use `langsys-js-svelte` with SvelteKit so the browser does
not re-fetch a catalog the server already has.

## What this does — and what it does not

Read this before the code. The two things people expect from "SSR translations" are
not what this pattern delivers, and the difference is invisible to every cheap check.

**What you get:**

- **One catalog fetch instead of two.** The server fetches; the client is handed the
  result and skips its own request.
- **Translations ready at hydration.** No network round-trip between the page becoming
  interactive and the text being correct.
- **A current catalog per request** — no stale build-time snapshot.
- **Lower API usage and cost.**

**What you do not get:**

- **Server-rendered translated body copy.** `LangsysApp.init()` runs in `onMount`,
  which does not execute during SSR. The catalog is therefore empty while the server
  renders, and `$t('Welcome', 'HomePage')` falls back to its first argument — the base
  phrase. **Your server HTML is in the base language.** The client corrects it after
  hydration.
- **SEO benefit for that copy.** A crawler reading the server response sees base
  language. See [Translated `<head>` for SEO](#translated-head-for-seo) below for the
  part you _can_ fix, and fix deliberately.

The honest one-line summary: seeding removes the **second fetch** and the
flash-to-correct-text that fetch caused. It does not move rendering to the server.

### Why `init()` goes in `onMount` — and why the usual reason is wrong

You will see this explained as "`document is not defined` on the server." That is not
the reason, and believing it leads somewhere bad: a reader who accepts it concludes a
`typeof window !== 'undefined'` guard makes server-side init safe.

It does not. Server-side init **works** — and then corrupts concurrent requests. In
`langsys-js-typescript`, `LangsysApp` is a module-level singleton, the catalog and
loaded-locale live in module-level signals, and `Translations` subscribes to those
globals in its own constructor. A "per-request instance" is not isolated from them.
Under any real concurrency, one visitor's locale overwrites another's mid-render.

So `onMount` is not a workaround for a missing DOM — it is what keeps request state out
of process-global state. Do not move it behind a `window` guard.

## SvelteKit implementation

### Step 1: Server-side data fetching

Two things here are easy to get wrong and fail quietly. Both are called out in the
comments.

```typescript
// src/routes/+layout.server.ts
import { LangsysApp, type iCategories } from 'langsys-js-svelte';
import { LANGSYS_PROJECT_ID, LANGSYS_API_KEY } from '$env/static/private';
import { PUBLIC_LANGSYS_API_KEY } from '$env/static/public';

// The locales configured on your Langsys project, as exact tags. The translations
// endpoint matches them LITERALLY — if your project's Spanish is `es-CR`, then
// `locale=es` is a 422, not a fuzzy match onto `es-CR`.
const SUPPORTED = ['en-US', 'es-CR', 'fr-FR', 'it-IT'];
const BASE_LOCALE = 'en-US';

export async function load({ fetch, request, locals }) {
    // Resolve Accept-Language down to a tag the project actually has. This helper is
    // pure — it reads the header and returns a string; it touches no SDK state, so
    // it is safe on the server. It returns `false` when there is nothing to go on,
    // and returns the VISITOR'S OWN TAG UNCHANGED when nothing matches — so always
    // check the result against your list rather than trusting it.
    const detected = locals.userLocale || LangsysApp.detectPreferredLocale(request.headers.get('accept-language'), SUPPORTED);
    const locale = typeof detected === 'string' && SUPPORTED.includes(detected) ? detected : BASE_LOCALE;

    const response = await fetch(`https://api.langsys.dev/api/translations?project_id=${LANGSYS_PROJECT_ID}&locale=${locale}`, {
        headers: {
            'x-Authorization': LANGSYS_API_KEY,
            'Content-Type': 'application/json',
        },
    });
    const result = await response.json();

    return {
        locale,
        translations: result.data as iCategories,
        projectId: LANGSYS_PROJECT_ID,
        apiKey: PUBLIC_LANGSYS_API_KEY, // use a read-only key for the client
    };
}
```

> **Use `/api/translations?project_id=…&locale=…`.** This is the route the SDK itself
> calls, so a hand-rolled server fetch and the client's later fetches agree. The older
> `/api/projects/{id}/translations?locale=…` form still answers, but it resolves
> locales more loosely than the current route — so a bare `es` succeeds there and then
> 422s from the client, and you get a working server payload paired with an empty
> client catalog. Matching the SDK's route is what keeps that from happening.

### Step 2: Client-side initialization

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
    import { writable } from 'svelte/store';
    import { onMount } from 'svelte';
    import { LangsysApp, type iLangsysInitConfig } from 'langsys-js-svelte';
    import type { PageData } from './$types';

    let { data, children }: { data: PageData; children: any } = $props();

    const userLocale = writable(data.locale);

    // onMount, not a `typeof window` guard — see "Why init() goes in onMount" above.
    onMount(async () => {
        const config: iLangsysInitConfig = {
            projectid: data.projectId,
            key: data.apiKey,
            UserLocaleStore: userLocale,
            baseLocale: 'en-US',
            initialTranslations: data.translations,
            initialTranslationsLocale: data.locale,
            ssrTokenStrategy: 'client',
        };

        await LangsysApp.init(config);
    });
</script>

{@render children()}
```

### Step 3: Using translations

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
    import { t } from 'langsys-js-svelte';
</script>

<h1>{$t('Welcome', 'HomePage')}</h1><p>{$t('Description', 'HomePage')}</p><p>{$t('Hello, {name}!', 'HomePage', { name: 'Sarah' })}</p>
```

These render base language in the server HTML and correct themselves at hydration.
That is expected — see [What this does](#what-this-does--and-what-it-does-not).

> Inside `<Translate>` and `<Phrase>` markup, interpolation placeholders are `%name%`,
> not `{name}` — Svelte compiles a bare `{name}` in a template as its own expression
> tag before the SDK ever sees the text. The `{name}` above is fine because it is a
> JavaScript string argument to `$t()`, which the compiler does not touch. See the
> main `README.md`.

## Translated `<head>` for SEO

Because `$t` renders base language on the server, `<title>` and `<meta>` resolved
through `$t` are base language too — which is the one place it actually costs you.

Fix it by reading the server-fetched catalog directly. `data.translations` is a plain
`iCategories` object — `categories[category][phrase]` — so no SDK involvement, no
globals, and it works during SSR:

```svelte
<!-- src/routes/+layout.svelte, or any +page.svelte -->
<script lang="ts">
    let { data } = $props();

    // Plain object lookup against the server payload. Falls back to the phrase
    // itself, exactly as $t() does.
    const seo = (phrase: string, category: string) => data.translations?.[category]?.[phrase] || phrase;
</script>

<svelte:head>
    <title>{seo('Welcome', 'SEO')}</title>
    <meta name="description" content={seo('Description', 'SEO')} />
</svelte:head>
```

This is a deliberate bypass, not a workaround for a bug: it is the supported way to get
translated `<head>` content until request-scoped translation lands in the base SDK.

## Locale switching

Update the `userLocale` writable; the SDK reacts and fetches the new locale's
translations. Set a tag your project actually has — see the note in Step 1.

```svelte
<script lang="ts">
    import { LangsysApp } from 'langsys-js-svelte';
    import { writable } from 'svelte/store';

    // (assume userLocale was created at the layout level and is in scope)
    function changeLocale(newLocale: string) {
        $userLocale = newLocale; // subscribers in the SDK trigger a fetch
        // Optional: explicitly await the in-flight fetch:
        return LangsysApp.translationsLoadingPromise;
    }
</script>

<button onclick={() => changeLocale('es-CR')}>Español</button>
<button onclick={() => changeLocale('fr-FR')}>Français</button>
```

## Plain Node.js SSR

For non-SvelteKit SSR implementations. The same caveat applies — the server render is
base language; seeding removes the client's fetch:

```javascript
// server.js
import { render } from 'svelte/server';
import App from './App.svelte';

const translations = await fetch(/* ... */).then((r) => r.json());

const { html, head } = render(App, {
    props: { initialTranslations: translations, locale: 'en-US' },
});

res.send(`
<!DOCTYPE html>
<html>
<head>${head}</head>
<body>
    ${html}
    <script>
        window.__INITIAL_TRANSLATIONS__ = ${JSON.stringify(translations)};
        window.__INITIAL_LOCALE__ = 'en-US';
    </script>
    <script src="/app.js"></script>
</body>
</html>
`);
```

```javascript
// client.js
import { LangsysApp } from 'langsys-js-svelte';
import { writable } from 'svelte/store';

const userLocale = writable(window.__INITIAL_LOCALE__);

LangsysApp.init({
    projectid: 'your-project-id',
    key: 'your-api-key',
    UserLocaleStore: userLocale,
    initialTranslations: window.__INITIAL_TRANSLATIONS__,
    initialTranslationsLocale: window.__INITIAL_LOCALE__,
});
```

## Benefits

### Performance

- No duplicate API calls (server + client).
- Translations ready immediately on hydration — no post-hydration fetch, so no
  flash from base language to translated text once the page is live.
- Faster Time to Interactive (TTI).
- Reduced API usage and costs.

### Correctness

- A catalog fetched per request, not baked in at build time.
- Server and client agree on the locale, because both are handed the same resolved tag.

### Developer experience

- Simple configuration.
- Full TypeScript support, including compile-time-checked interpolation params on `$t()`.

> Not on this list, deliberately: server-rendered translated body copy, and the SEO
> benefit that would follow from it. See [What this does](#what-this-does--and-what-it-does-not).

## Configuration options

### SSR token strategy

Control how missing tokens are handled during SSR:

```typescript
{
    ssrTokenStrategy: 'client' | 'server' | 'auto';
}
```

- `'client'` (default) — queue tokens, send from client after hydration.
- `'server'` — send tokens immediately from server.
- `'auto'` — small batches (≤5) from server, larger batches from client.

### Debug mode

```typescript
{
    debug: true,
    initialTranslations: data.translations,
    initialTranslationsLocale: data.locale,
}
```

Look for:

- `SSR initial translations config:` on init — confirms pre-fetched data is detected.
- `Using pre-fetched translations for locale` — confirms the initial fetch was skipped.
- `Locale change detected!` — fires on a subsequent locale switch.

Run with `debug: true` in development and leave it on until you have seen these — the
three lines above are `Logger.log()` calls, which _are_ debug-gated.

A **failed** catalog fetch is not gated. `Logger.warn()` and `Logger.error()` emit
regardless of the `debug` setting, so a rejected fetch always prints. Verified by
executing the published SDK against the live API with `debug: false` and a locale the
project does not have:

```
[Langsys Warning] LangsysAppAPI failed to query { …"The locale provided is not a
                  base or target locale for this project"…, http: { status: 422 } }
[Langsys Error]   Error HTTP 422: Unprocessable Content
```

Two lines, always. What they _don't_ say is which locale was rejected or which tags the
project accepts — so if your page renders base language, check the console before
assuming the catalog is simply untranslated.

## Important notes

1. **One-time use.** `initialTranslations` is consumed only at init. Locale changes
   after init go through the normal fetch path.
2. **Matching locales.** Always provide `initialTranslationsLocale` with
   `initialTranslations` so the SDK knows what locale the data represents.
3. **Exact locale tags.** The value must be one of your project's configured locales,
   spelled the same way. Casing and `_` are normalized (`es_cr` → `es-CR`), but a bare
   language is _not_ widened to a region — `es` will not find `es-CR`. Resolve with
   `LangsysApp.detectPreferredLocale(header, supportedLocales)`, which does the
   language-to-region match for you.
4. **Data format.** The translations payload must match the `iCategories` shape
   returned by `LangsysAppAPI.getTranslations()`.
5. **Cache.** The 60-second locale cache still applies. Pre-fetched translations count
   as cached.
6. **Token creation.** Use a read-only API key for the client in production — missing
   tokens won't be sent. Keep the write key on the server (and ideally pre-populate
   tokens via your local dev environment).
7. **Dedupe `hreflang` alternates by URL token.** If you generate `<link rel="alternate">`
   tags or a locale switcher from your locale list with a keyed `{#each}`, two locales
   that share a URL token (`zh-Hant` and `zh-Hans` both shortened to `zh`) throw
   `each_key_duplicate` — and in SvelteKit that error blanks **every page on the site**,
   not just the affected locale. Adding a locale in the Translation Manager can
   therefore take a site down with no deploy. Dedupe on the token you key by, and keep
   script subtags distinct so `zh-Hant`/`zh-Hans` still route separately.

## Troubleshooting

### `curl` cannot tell you whether this is working

Body copy translates _after_ hydration, so `curl https://… | grep` shows base language
on a perfectly healthy page — and on a completely broken one. A page with an empty
catalog, a wrong locale, or a template bug looks byte-identical to a working page under
any check that does not run JavaScript.

Verify in a real browser after hydration, or with a headless browser that executes
scripts. If you need a server-side check, assert on the seeded payload (that the inline
`__INITIAL_TRANSLATIONS__` / `data.translations` blob is present, non-empty, and for the
expected locale) — not on the rendered text.

### Translations not appearing

- Check that `initialTranslationsLocale` matches the `UserLocaleStore` value at init.
- Check the locale is one of your project's configured tags (note 3 above). A
  mismatched tag returns 422 and leaves the catalog empty. This always logs — a
  `[Langsys Warning] LangsysAppAPI failed to query` and a `[Langsys Error] Error HTTP
422`, both ungated — but neither names the offending locale, so it is easy to read
  past.
- Verify the translations payload matches the `iCategories` shape.
- Enable `debug: true` and look for the messages above.

### Every string renders as its category name

Almost always a stale `langsys-js-typescript`. If your bundler inlines a `link:`,
`file:`, or workspace copy of the SDK, **the deploying machine's checkout is what
ships** — an old build there produces this across the entire site while the build
succeeds and type-checks cleanly. Depend on the published npm package (see `CLAUDE.md`),
and check the resolved version in your lockfile, not in a local `node_modules`.

### Still seeing duplicate API calls

- Confirm both `initialTranslations` _and_ `initialTranslationsLocale` are passed.
- Confirm the locale hasn't drifted between server and client.
- Note that the _first_ render calling `$t(...)` legitimately precedes `init()` — it
  runs before `onMount`. That is the base-language render, not a bug, and not something
  to fix by initializing earlier.

### TypeScript errors on `$t()`

- Placeholders are compile-time-checked: `$t('Hello, {name}!', 'Cat')` _requires_ a
  params object with `name`. Either add the key or remove the placeholder.
- Allowed param value types: `string | number | Date | boolean`.

## Example project structure

```
src/
├── routes/
│   ├── +layout.server.ts   # Fetch translations
│   ├── +layout.svelte      # Initialize Langsys
│   └── +page.svelte        # Use translations
├── lib/
│   └── stores/
│       └── locale.ts       # User locale writable (if you keep it separate)
└── app.html
```

## Migration from v2.x

If you're migrating from `langsys-js-svelte` v2.x, the SSR plumbing is unchanged —
`initialTranslations` / `initialTranslationsLocale` work exactly as before. The only
call-site difference is template usage:

```svelte
<!-- v2.x -->
<h1>{$_['HomePage']['Welcome']}</h1>

<!-- v3.0+ -->
<h1>{$t('Welcome', 'HomePage')}</h1>
```

See `CHANGELOG.md` for the full breaking-change list.
