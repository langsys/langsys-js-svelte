# Langsys SDK - Svelte

Langsys revolutionizes localization for apps with easy to integrate, realtime, continuous translations. Read more about Langsys Translation Manager [at the website](https://Langsys.dev/).

Integrate the Langsys Translation Manager into your Svelte and SvelteKit applications using this SDK.

## Requirements

- **Svelte 5** with full SSR support in SvelteKit.

> The last version supporting Svelte 3 / 4 (client-side only) is tagged `v-last-svelte4-compat` (`1.2.1`).
>
> The last version with the `$_['Category']['Token']` proxy access pattern (Svelte 5) is tagged `v-last-proxy-compat` (`2.0.0`). v3 replaces it with `$t(phrase, category?, params?)` — see the [3.0.0 CHANGELOG](./CHANGELOG.md) for migration notes.

[![GitHub Release](https://img.shields.io/github/release/langsys/langsys-js-svelte.svg?style=flat)]()
[![GitHub last commit](https://img.shields.io/github/last-commit/langsys/langsys-js-svelte.svg?style=flat)]()
[![GitHub pull requests](https://img.shields.io/github/issues-pr/langsys/langsys-js-svelte.svg?style=flat)]()
[![PR's Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](http://makeapullrequest.com)
[![NPM License](https://img.shields.io/npm/l/all-contributors.svg?style=flat)](https://github.com/langsys/langsys-js-svelte/blob/master/LICENSE)

## How it's layered

As of v3.0.0, `langsys-js-svelte` is a thin Svelte binding over the framework-agnostic [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript) package — which owns the API client, translation lifecycle, token discovery, DOM tokenizer, and SSR-aware token strategies. This package adds only the Svelte-native concerns:

- A `LangsysApp` whose `init` accepts a Svelte `Writable<string>` for the user locale
- A `t` store you read with `$t('Phrase', 'Category')` — re-renders any subscribed template when translations or the loaded locale change
- A `<Translate>` Svelte 5 component wrapping the underlying DOM walker

If you need the SDK outside Svelte (a Node script, a non-Svelte web app), import from `langsys-js-typescript` directly.

## Install

```bash
npm install langsys-js-svelte
```

`langsys-js-typescript` is installed automatically as a transitive dependency.

## Creating a Langsys project

Visit [Langsys.dev](https://Langsys.dev/) to create your account, then create your project. Take note of your project ID and API key.

### API key permissions

- **Write key** (development): the SDK auto-creates new translation tokens and content blocks as they appear in your app.
- **Read-only key** (production): the SDK fetches translations only — no token creation, no content-block writes.

The SDK detects the key type automatically and behaves accordingly.

## Initialization

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
    import { writable } from 'svelte/store';
    import { onMount } from 'svelte';
    import { LangsysApp, type iLangsysInitConfig } from 'langsys-js-svelte';

    const userLocale = writable('en-US');
    let appReady = $state(false);
    let appInitError = $state<string | null>(null);

    onMount(async () => {
        const config: iLangsysInitConfig = {
            projectid: import.meta.env.VITE_LANGSYS_PROJECT_ID,
            key: import.meta.env.VITE_LANGSYS_API_KEY,
            UserLocaleStore: userLocale,
            baseLocale: 'en-US',
            debug: false,
            ssrTokenStrategy: 'client',
        };

        const res = await LangsysApp.init(config);
        if (res.status) appReady = true;
        else appInitError = res.errors?.join(', ') ?? 'Init failed';
    });
</script>

{#if appInitError}
    <p>Langsys init failed: {appInitError}</p>
{:else if !appReady}
    <p>Loading…</p>
{:else}
    <slot />
{/if}
```

`UserLocaleStore` is a standard Svelte `Writable<string>` — set/update it however you like and the SDK reacts.

### SSR token strategy

`ssrTokenStrategy` (default `'client'`) controls when missing tokens are sent during server rendering:

- `'client'` — tokens collected on the server are flushed from the client after hydration. Best for performance.
- `'server'` — tokens are sent immediately during SSR. Best for reliability and immediate registration.
- `'auto'` — small batches (≤5) sent from server, larger queued for client.

## Using translations

### `$t(phrase, category?, params?)` — the everyday API

```svelte
<script>
    import { t } from 'langsys-js-svelte';
</script>

<h1>{$t('Welcome to my app', 'UI')}</h1>
<p>{$t('Hello, {name}!', 'UI', { name: 'Sarah' })}</p>
```

The signature is **`$t(phrase, category?, params?)`** — the phrase comes first, the category is optional, and params come last:

```svelte
{$t('Save')}                                    <!-- no category, no params -->
{$t('Save', 'UI')}                              <!-- categorized -->
{$t('Hello, {name}!', { name: 'X' })}           <!-- no category, with params -->
{$t('Hello, {name}!', 'Greetings', { name: 'X' })} <!-- category + params -->
```

The **phrase itself is the lookup key** *and* the base-language default — there's no separate keys file to maintain. The first render of a phrase registers it in the Translation Manager (when using a write key); from then on, translations are fetched and rendered automatically as locales change.

#### Interpolation

Curly-brace placeholders are substituted from the params argument:

```svelte
<p>{$t('You have {count} new messages', 'Notifications', { count: 3 })}</p>
```

Placeholder names are extracted from the phrase at compile time and **type-checked**: omitting a required key or adding an extra one is a TypeScript error.

```typescript
$t('You have {count} new messages', 'Notifications', {});
// ❌ Property 'count' is missing in type '{}'

$t('You have {count} new messages', 'Notifications', { count: 3, extra: 'x' });
// ❌ Object literal may only specify known properties, and 'extra' does not exist
```

Allowed value types: `string | number | Date | boolean`. Dates serialize to ISO 8601.

> Future versions will swap the simple `{name}` runtime for ICU MessageFormat — adding plural / select / date formatting — without changing the public signature. Today's `$t('{count} items', 'Cart', { count })` will evolve to `$t('{count, plural, one {# item} other {# items}}', 'Cart', { count })`.

#### Categorization disambiguates context

Different categories give the *same* phrase different translations:

```svelte
<strong>{$t('Home', 'Main Menu')}</strong>      <!-- "Inicio" in Spanish -->
<strong>{$t('Home', 'Home repairs')}</strong>   <!-- "Hogar" in Spanish -->
```

Without categorization, "Home" would only have one translation — which can't work for both contexts. Langsys's philosophy is *translate once, use everywhere*; categorize when the same phrase legitimately means different things.

A good rule for category names: the module or feature the phrase lives in (`Account`, `Errors`, `Checkout`, `UI`).

### `<Translate>` — HTML content blocks

For larger blocks of HTML where the structure should be preserved for the translator:

```svelte
<script>
    import { Translate } from 'langsys-js-svelte';
</script>

<Translate category="Blog" tag="article">
    <h1 class="title">My article title</h1>
    <p>My content <strong>is the best</strong> when internationalized by Langsys.</p>
    <p>Translators see this exactly as users do — same styling, same structure.</p>
</Translate>
```

The component:
- Recursively tokenizes text nodes and translatable attributes (`placeholder`, `alt`, `title`, `aria-label`, plus button/input `value` attributes and `<option>` text).
- Captures semantic CSS so translators see the styled appearance in the Translation Manager.
- Registers the whole thing as a **content block** that translators handle as one unit while still translating the individual phrases inside.
- Auto re-translates on locale change.

Use `<Translate>` for prose, marketing copy, CMS-rendered articles, forms with placeholders — anything where the structure matters. Use `$t()` for individual strings.

```svelte
<!-- CMS content goes through Translate as-is -->
<Translate category="News" tag="div">
    {@html article?.content}
</Translate>
```

`<Translate>` props: `category?`, `custom_id?`, `label?`, `tag?` (defaults to `translate`), `class?`, `children`.

## Reactive stores

| Export | Type | Notes |
|---|---|---|
| `t` | `Readable<TFunction>` | Re-emits whenever translations or locale change. Use as `$t('Phrase', 'Cat')`. |
| `currentlyLoadedLocale` | `Readable<string>` | The locale whose translations are currently loaded (lags `UserLocaleStore` until the fetch completes). |
| `sTranslations` | `Readable<iCategories>` | Raw translation catalog. Rarely needed in app code. |

## Server-Side Rendering

The SDK is fully SSR-compatible with SvelteKit. The main pattern is to pre-fetch translations server-side and seed them through `initialTranslations` / `initialTranslationsLocale` so the client doesn't refetch on hydration.

📖 **See [README-SSR.md](./README-SSR.md)** for a complete SvelteKit walkthrough.

## Utilities

`LangsysApp` exposes localized helpers:

```svelte
<script lang="ts">
    import { onMount } from 'svelte';
    import {
        LangsysApp,
        type iCountryList,
        type iCountryDialCode,
        type iCurrencyList,
        type iLocaleDefault,
    } from 'langsys-js-svelte';

    let countries: iCountryList;
    let dialCodes: iCountryDialCode[];
    let currencies: iCurrencyList;
    let locales: iLocaleDefault;
    let localeName: string;

    onMount(async () => {
        countries  = await LangsysApp.getCountries();     // [{ code: "US", label: "United States" }, ...]
        dialCodes  = await LangsysApp.getDialCodes();     // [{ country_code: "US", dial_code: "+1", name: "United States" }, ...]
        currencies = await LangsysApp.getCurrencies();    // [{ code: "USD", name: "US Dollar", symbol: "$", ... }, ...]
        locales    = await LangsysApp.getLocales();       // { "English": [{ code: "en-US", name: "English (US)" }, ...], ... }
        localeName = await LangsysApp.getLocaleNameWithLookup('es-ES', true, 'fr-FR'); // "espagnol"
    });
</script>
```

### Detecting the user's preferred locale

```typescript
// Browser: navigator.languages → fallback to navigator.language
const locale = LangsysApp.detectPreferredLocale();
// Returns 'en-US', 'fr', etc., or false if nothing can be detected

// SSR (hooks.server.ts / +page.server.ts): parses Accept-Language
const locale = LangsysApp.detectPreferredLocale(request.headers.get('Accept-Language'));

// Matched against your app's supported locales
const supportedLocales = (await LangsysApp.getLocalesFlat()).map((l) => l.code);
const locale = LangsysApp.detectPreferredLocale(
    request.headers.get('Accept-Language'),
    supportedLocales,
);
```

The matcher tries exact match first (e.g. `en-US`), then language-only (`en` matches `en-GB`). When you pass `supportedLocales` and none match, it falls back to the user's top preference (normalized); it returns `false` only when no preference can be determined at all.

### Waiting for translations to load

When changing locale mid-session, you may want to re-run dependent code after the new translations arrive:

```svelte
<script>
    import { LangsysApp } from 'langsys-js-svelte';

    $effect(() => {
        LangsysApp.translationsLoadingPromise.then(() => {
            // re-render content / regenerate UI here
        });
    });
</script>
```

## Migrating from v2.x

The v2.x proxy-based API was replaced in v3.0.0 with `$t()`. See [CHANGELOG.md](./CHANGELOG.md) for the full diff.

Quick conversion:

```svelte
<!-- v2.x -->
<h1>{$_['UI']['Title']}</h1>

<!-- v3.0+ -->
<h1>{$t('Title', 'UI')}</h1>
```

Note the order: the proxy was `$_[category][phrase]`, while `$t()` takes the **phrase first, then the category** — `$_['UI']['Title']` becomes `$t('Title', 'UI')`. The win is that `$t()` accommodates interpolation cleanly and is type-checked at the call site. The change is mechanical and codemod-friendly.
