# SvelteKit: a request scope per request

A server process renders for many visitors at once, and the core keeps its catalog and locale in module state. So each request renders inside a **request scope** of its own, which is the core's (`node_modules/langsys-js-typescript/skill/server-rendering.md`). `createLangsysHandle` opens one per request in SvelteKit's `handle`, and `hydrateFromServer()` hands the scope's catalog to the browser before hydration.

## The server

```ts
// src/app.d.ts
declare global {
    namespace App {
        interface Locals {
            locale: string;
        }
    }
}

export {};
```

```ts
// src/hooks.server.ts
import type { ServerInit } from '@sveltejs/kit';
import { writable } from 'svelte/store';
import { LangsysApp } from 'langsys-js-svelte';
import { createLangsysHandle } from 'langsys-js-svelte/kit/server';
import { LANGSYS_API_KEY, LANGSYS_PROJECT_ID } from '$env/static/private';

const LOCALES = ['en-us', 'es-cr', 'fr-fr'];   // the locales the project serves, lowercase

// Once per server process, before the first request.
export const init: ServerInit = async () => {
    const res = await LangsysApp.init({
        projectid: LANGSYS_PROJECT_ID,
        key: LANGSYS_API_KEY,
        UserLocaleStore: writable('en-us'),   // each request's scope has its own locale
        baseLocale: 'en-us',
    });
    if (!res.status) console.error('Langsys init failed', res.errors);
};

export const handle = createLangsysHandle({
    // The locale the visitor chose (a cookie the app sets), then Accept-Language, then the base.
    locale: (event) => {
        const chosen = event.cookies.get('locale');
        const header = event.request.headers.get('accept-language');
        event.locals.locale =
            (chosen && LOCALES.includes(chosen) ? chosen : false) ||
            (header ? LangsysApp.detectPreferredLocale(header, LOCALES) : false) ||
            'en-us';
        return event.locals.locale;
    },
});
```

For each request the handle opens a scope, renders the whole response inside it (`load`, its `await`s and every component), writes the scope's seed into the page as an inline script, and closes the scope after the response, never while the visitor waits.

- **Inside the scope, `$t`, `$currentlyLoadedLocale` and `$sTranslations` read this request's locale and catalog**, in components and `<svelte:head>` alike, and an `await` before a read is safe. The served HTML is translated.
- **`<Translate>` and `<Phrase>` with the build transform are translated in the served HTML** and their hosts carry the block's id. Without the transform, or for a fallback block, they serve the source and translate after hydration.
- **`LangsysApp.getCountries()` and the other reference lists** name their list in the request's locale when given none (`node_modules/langsys-js-typescript/skill/locales.md`).
- **What the render missed is registered after the response** only under `ssrTokenStrategy: 'server'` or `'auto'` in the server's `init()`, and only when the server's own address is on the key's allow-list. Otherwise the browser registers it after hydration. The strategy and its precondition are the core's (`node_modules/langsys-js-typescript/skill/server-rendering.md`).
- **Choosing the locale is the app's.** An app that puts the locale in the URL reads it there first. Every candidate is checked against the project's locales, and `LangsysApp.detectPreferredLocale(header, supported)` matches `Accept-Language` against them (`node_modules/langsys-js-typescript/skill/locales.md`). When the locale comes from a cookie or the header rather than the URL, send `Vary: Cookie, Accept-Language`, or a cache serves one visitor's language to the next.

### Options

| Option | Default | What it does |
|---|---|---|
| `locale` | required | `(event) => locale`, sync or async: the request's locale |
| `catalog` | fetched | `(event, locale) => catalog`: a catalog already in hand. Otherwise the scope fetches it, at most once per locale per request |
| `credentials` | `init()`'s | `(event) => ({ projectid, key })` or `undefined`: the request's own project and key, for a server that serves several projects. Never written into the page |
| `match` | every request | `(event) => boolean`: which requests get a scope |
| `seed` | `true` | `false` writes no inline script, for a CSP that forbids one. The browser then has no seed, and `hydrateFromServer()` returns `false` |
| `storage` | a new `AsyncLocalStorage` from `node:async_hooks` | The storage that carries the scope across `load`'s `await`s, for a runtime that supplies its own |

The seed is an inline `<script>` without a nonce. Under SvelteKit's `kit.csp`, which gives its nonce or hashes only to SvelteKit's own scripts, the browser blocks it, so an app with `kit.csp` sets `seed: false`. Without a seed, the page shows what the browser's own catalog holds from hydration until `init()` has fetched the catalog. How `credentials` and `catalog` combine is the core's (`node_modules/langsys-js-typescript/skill/server-rendering.md`).

## The browser

```ts
// src/hooks.client.ts
import { hydrateFromServer } from 'langsys-js-svelte/kit';

export const init = () => {
    hydrateFromServer();   // the served catalog in place before hydration
};
```

```ts
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({ locale: locals.locale });
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
    import { onMount, untrack } from 'svelte';
    import { writable } from 'svelte/store';
    import { LangsysApp } from 'langsys-js-svelte';
    import { syncNavigation } from 'langsys-js-svelte/kit';
    import { PUBLIC_LANGSYS_API_KEY, PUBLIC_LANGSYS_PROJECT_ID } from '$env/static/public';

    let { data, children } = $props();

    // Start at the locale the server rendered, or init() fetches another and the page changes language.
    const userLocale = writable(untrack(() => data.locale));

    syncNavigation();

    onMount(async () => {
        const res = await LangsysApp.init({
            projectid: PUBLIC_LANGSYS_PROJECT_ID,
            key: PUBLIC_LANGSYS_API_KEY,
            UserLocaleStore: userLocale,
            baseLocale: 'en-us',
        });
        if (!res.status) console.error('Langsys init failed', res.errors);
    });
</script>

{@render children()}
```

- **`hydrateFromServer()`** puts the request's catalog, blocks and phrases in place through the core's `LangsysApp.seedCatalog()`, so the first browser render matches the served HTML and nothing the server already sent is sent again. It returns whether it found a seed. It runs in SvelteKit's `init` client hook, from 2.10, which runs before hydration.
- **`init()` still runs in the browser.** It authorizes the browser's session, which decides whether the browser registers, and it follows the locale store from then on.
- **A locale switch in the browser is `userLocale.set(next)`.** Persist it where your `locale` option reads it, the `locale` cookie above or the URL, or the next server render serves the previous locale.
- **`syncNavigation()`**, called once in the root layout, tells the core after each client-side navigation that the route changed. A layout stays mounted across navigations, and without it a phrase in a header or a footer is recorded for the session's first URL only. It sends nothing itself, and it is the core's `notifyNavigation()` on SvelteKit's `afterNavigate` (`node_modules/langsys-js-typescript/skill/writing.md`). With another router, call `notifyNavigation()` from its after-navigation hook.

## Without the handle

`README-SSR.md`, which ships in this package (`node_modules/langsys-js-svelte/README-SSR.md`), describes the patterns for a server that doesn't use `createLangsysHandle`: a catalog fetched in `load` and passed to `init()` as `initialTranslations` in the browser, which leaves the served HTML in the source language, and a catalog written into `sTranslations` in a layout component's body, which translates it. The body seed is sound only under Svelte's default synchronous server renderer. Written in a `handle` hook, or under `compilerOptions.experimental.async`, it serves requests in each other's language. Prefer the handle.
