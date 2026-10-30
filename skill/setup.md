# Install, `init()` and the stores

## Install

```bash
npm install langsys-js-svelte
```

- **Svelte 5.** `svelte` is a peer dependency from `^5.0.0`. A Svelte 3 or 4 app upgrades Svelte first; nothing in this package runs on them.
- **SvelteKit 2.10 or later** for `langsys-js-svelte/kit` and `langsys-js-svelte/kit/server`. `@sveltejs/kit` is an optional peer from `^2.10.0`, the release with the `init` hooks they use. An app without SvelteKit uses the main entry and `langsys-js-svelte/preprocess` only.
- **`langsys-js-typescript` comes with it**, as a dependency at the range this version requires.
- **Then add the build transform** ([transform.md](./transform.md)). Without it, `<Translate>` and `<Phrase>` register nothing.

## Credentials in the browser

The project id and the browser's key reach the client through the bundler's public environment. Which key a browser may hold is the entry skill's subject (`langsys`, projects and keys).

| App | Variables | Read with |
|---|---|---|
| SvelteKit | `PUBLIC_LANGSYS_PROJECT_ID`, `PUBLIC_LANGSYS_API_KEY` | `$env/static/public` |
| Svelte on Vite | `VITE_LANGSYS_PROJECT_ID`, `VITE_LANGSYS_API_KEY` | `import.meta.env` |

A server-side key goes in `$env/static/private` or `$env/dynamic/private`, which never reach the client bundle ([sveltekit.md](./sveltekit.md)).

## `LangsysApp.init()`

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { writable } from 'svelte/store';
    import { LangsysApp } from 'langsys-js-svelte';
    import { PUBLIC_LANGSYS_API_KEY, PUBLIC_LANGSYS_PROJECT_ID } from '$env/static/public';

    let { children } = $props();

    const userLocale = writable('en-us');

    onMount(async () => {
        const res = await LangsysApp.init({
            projectid: PUBLIC_LANGSYS_PROJECT_ID,
            key: PUBLIC_LANGSYS_API_KEY,
            UserLocaleStore: userLocale,
            baseLocale: 'en-us',
            debug: import.meta.env.DEV,
        });
        if (!res.status) console.error('Langsys init failed', res.errors);
    });
</script>

{@render children()}
```

- **The options are the core's** (`node_modules/langsys-js-typescript/skill/init-config.md`), with two differences: `UserLocaleStore` is a Svelte `Writable<string>`, which the binding adapts to the core's locale source, and `writeGrant` also takes a Svelte store (below). The type is `iLangsysInitConfig`, exported from this package.
- **Call it once, in the browser.** `onMount` runs only in the browser, once the component has mounted: the root `+layout.svelte` in SvelteKit, the root component in a plain Svelte app (`App.svelte`, reading `import.meta.env.VITE_LANGSYS_*`). On a SvelteKit server, `init()` runs once in the server's own `init` hook and each request renders in its own scope ([sveltekit.md](./sveltekit.md)).
- **Render the children whatever `init()` answers.** Text renders as its source until a translation exists, so nothing needs to wait ([pitfalls.md](./pitfalls.md)).
- **Change the locale by setting the store:** `userLocale.set('es-es')`. The core fetches that catalog and every `$t` and component re-renders. `$currentlyLoadedLocale` follows once the catalog is in. Locales come back lowercase (`node_modules/langsys-js-typescript/skill/locales.md`).

## The stores

| Export | What it is | Written by |
|---|---|---|
| `t` | The current translation function. `{$t('Save', 'UI')}` reads it and re-renders on every catalog or locale change | The core. Never write it |
| `currentlyLoadedLocale` | The locale whose catalog is loaded | The core. Writable, and process-wide on a server |
| `sTranslations` | The catalog | The core. Writable, and process-wide on a server |
| `writeEnabled` | The server's write decision for this session: `true`, `false`, or `undefined` while not known | The core. Read-only |
| `serverMessage` | `$serverMessage(entry)` renders a server message entry ([components.md](./components.md)) | Derived from `t` |

`t`, `currentlyLoadedLocale` and `sTranslations` are the core's own signals, which satisfy Svelte's store contract, so `$store` syntax reads them with no adapter. Don't write `currentlyLoadedLocale` or `sTranslations` yourself: on SvelteKit the request scope gives each request its own ([sveltekit.md](./sveltekit.md)).

**`$t` exists only in a component.** Svelte's `$store` syntax works in `.svelte` files, not in `.ts` or `.svelte.ts` modules. There, `get(t)` (from `svelte/store`) or `LangsysApp.t` gives the current function, which reads the catalog when called and doesn't re-run on a change.

## `writeEnabled`

```svelte
<script lang="ts">
    import { writeEnabled } from 'langsys-js-svelte';
</script>

{#if $writeEnabled === undefined}
    <span>Checking</span>
{:else if $writeEnabled}
    <span>New content registers</span>
{:else}
    <span>Read-only session</span>
{/if}
```

What the value means, and what to check when nothing registers, is the core's (`node_modules/langsys-js-typescript/skill/writing.md`). What Svelte changes is when the value shows:

- **It is `undefined` during the server render and the whole hydration pass**, then takes the live value at once. So hydrated markup matches what the server rendered, even when a universal `load` awaited `init()` in the browser, behind `browser` from `$app/environment`, before hydration.
- **In markup, `$writeEnabled` shows the live value** from the first moment after hydration.
- **A one-shot `get(writeEnabled)`** reads the live value once a component has rendered the store, or once the first page has mounted in an app that calls `syncNavigation()`. The first page's `onMount` runs before that and reads `undefined`, and in an app with neither it stays `undefined`.
- **In a universal `load`, read it with `get(writeEnabled)`.** A subscription held there counts as a render and ends the hydration pass early.

Registration needs a write-enabled session. A session that can't write registers nothing: it reports the page's URL, and Langsys records it. Content registers only from a write-enabled session: a browser at an allow-listed address, a server rendering from an allow-listed address, or a signed-in user's session holding a write grant.

## Write grants

An app behind a login makes its users' sessions write-enabled with a grant its backend mints. In Svelte the grant can be a store:

```ts
import { writable } from 'svelte/store';
import { LangsysApp } from 'langsys-js-svelte';

const writeGrant = writable<string | null>(null);   // null until the user signs in

await LangsysApp.init({ projectid, key, UserLocaleStore: userLocale, writeGrant });

// after sign-in:
writeGrant.set(await fetchGrant());
await LangsysApp.setWriteGrant(writeGrant);         // the server decides again now
```

- **`writeGrant` takes a store, a function or a string.** A store or a function is read before each request, so a replaced token goes out with the next one. A string expires with its token. Configure it at `init()` even while it holds `null`, for the reason the core's `node_modules/langsys-js-typescript/skill/writing.md` gives.
- **`LangsysApp.setWriteGrant(grant)` re-authorizes**, so the server decides the session again at once, rather than with the next catalog it serves. It takes a store too, the same one included. `await` it when the next step needs `$writeEnabled` settled. The core's top-level `setWriteGrant` doesn't take a Svelte store.
- **`WriteGrantSource`** is the type both accept: the core's `WriteGrant`, or a store of `string | null | undefined`.
