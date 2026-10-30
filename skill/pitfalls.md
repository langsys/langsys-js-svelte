# Svelte pitfalls

The mistakes below are Svelte's own. The ones every binding shares, such as building a phrase or swapping the phrase and the category, are the core's (`node_modules/langsys-js-typescript/skill/invariants.md`). When nothing registers at all, `$t()` included, start with the session's write decision (`node_modules/langsys-js-typescript/skill/writing.md`).

## `$t()` registers, `<Translate>` and `<Phrase>` don't

| Cause | Fix |
|---|---|
| No `langsysPreprocess()` in `svelte.config.js` | Add it, last in `preprocess` ([transform.md](./transform.md)). With `debug: true`, a notice names it |
| The transform runs before another preprocessor | Put it last: it reads the markup the others produce |
| The components are imported from the app's own module, which the transform doesn't know | List that module in `from`, beside `'langsys-js-svelte'` |
| The block holds something the transform can't read: an `{#each}`, a component, a `bind:` | The build warning names the block. Restructure it ([transform.md](./transform.md)) |

## A phrase per user, or a key that changes with the build

| Cause | Fix |
|---|---|
| `` $t(`Hello ${name}`) `` without the transform | `$t('Hello {name}', 'Home', { name })`, which is right with or without it |
| An element's markup passed to `$t()`, such as its `innerHTML` | Svelte's scoped-style classes (`svelte-1x2y3z`) are part of that markup and change when the styles change, so the phrase changes with them. Use `<Phrase>`, which keeps markup out of the phrase |
| `{name}` inside a `<Translate>` in an app without the transform | It registers nothing, and it renders untranslated, because the text holds the value. Add the transform, or write `%name%` with `params` |

## The served page is in another request's language

Everything below writes the core's process-wide state for one request while another renders.

| Cause | Fix |
|---|---|
| `LangsysApp.init()` called per request on the server: in a universal `+layout.ts` `load` without a `browser` guard, or in a component's script outside `onMount` | Initialize once in the server's `init` hook and render through `createLangsysHandle` ([sveltekit.md](./sveltekit.md)). In the browser, in `onMount` |
| `sTranslations` or `currentlyLoadedLocale` written in a `handle` hook before `await resolve(event)` | Use `createLangsysHandle`, whose scope keeps each request's catalog its own |
| A layout-body seed with `compilerOptions.experimental.async` on | The body seed is sound only under the default synchronous renderer. Use `createLangsysHandle` |

## The page changes language after hydration

| Cause | Fix |
|---|---|
| The browser's `UserLocaleStore` starts at another locale than the server rendered | Create it from the locale the server rendered, as [sveltekit.md](./sveltekit.md) does |
| No seed reached the browser: `hydrateFromServer()` isn't called in `src/hooks.client.ts`, or the handle has `seed: false` | Call it in the `init` client hook. Under `seed: false`, which `kit.csp` requires, the page shows the browser's own catalog until `init()` has fetched one ([sveltekit.md](./sveltekit.md)) |
| A locale switch kept only in the browser's store | Persist it where the handle's `locale` option reads it, in the URL or a cookie |

## The served page is a spinner, or blank

A layout that renders `{#if ready}{@render children()}{:else}…{/if}` around `init()` serves the `else` branch as the page, because `onMount` never runs on the server. A crawler indexes the spinner, and a failed `init()` hides the site. Text renders as its source until a translation exists, so render the children always and show any state beside them.

## Translations never show in some components

The project holds two copies of the core. A copy's catalog, locale and write decision are its own module state, so a component bound to one copy never sees `init()` called on the other. `npm ls langsys-js-typescript` must show one version. Two copies appear when the app, or another Langsys binding in it, requires a range of `langsys-js-typescript` that doesn't overlap this package's. Align the ranges.

## Every page fails after a locale is added

A keyed `{#each}` over the project's locales, keyed by a shortened token such as the language alone, throws `each_key_duplicate` once two locales share the token (`zh-hant` and `zh-hans` as `zh`). In SvelteKit the error fails every page that renders the list, typically through a layout's `hreflang` links or locale switcher. Key by the full locale, and keep script subtags distinct.

## `$writeEnabled` reads as read-only

| Cause | Fix |
|---|---|
| `{#if !$writeEnabled}` treats `undefined`, not known yet, as `false` | Test `$writeEnabled === false` for read-only ([setup.md](./setup.md)) |
| `get(writeEnabled)` in the first page's `onMount` | That runs before the hydration pass ends and reads `undefined`. Subscribe instead: `$writeEnabled` in markup, or `writeEnabled.subscribe()` kept until the value is defined |

## Smaller ones

- **`$t` exists only in components.** In a `.ts` module, call `get(t)(…)` or `LangsysApp.t(…)`, which read the catalog once and don't re-run on a change.
- **`<Translate>`'s default host is an unknown `<translate>` element**, which renders inline. Pass `tag="div"`, or another block element, for block content.
- **`LangsysApp.setWriteGrant()`, not the core's `setWriteGrant()`,** takes a Svelte store.
