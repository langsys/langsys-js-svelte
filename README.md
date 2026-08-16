# Langsys SDK - Svelte

[![npm](https://img.shields.io/npm/v/langsys-js-svelte.svg?style=flat)](https://www.npmjs.com/package/langsys-js-svelte)
[![build](https://img.shields.io/github/actions/workflow/status/langsys/langsys-js-svelte/ci.yml?style=flat)](https://github.com/langsys/langsys-js-svelte/actions)
[![last commit](https://img.shields.io/github/last-commit/langsys/langsys-js-svelte.svg?style=flat)](https://github.com/langsys/langsys-js-svelte/commits)
[![commit activity](https://img.shields.io/github/commit-activity/m/langsys/langsys-js-svelte.svg?style=flat)](https://github.com/langsys/langsys-js-svelte/pulse)
[![types](https://img.shields.io/npm/types/langsys-js-svelte.svg?style=flat)](https://www.npmjs.com/package/langsys-js-svelte)
[![downloads](https://img.shields.io/npm/dm/langsys-js-svelte.svg?style=flat)](https://www.npmjs.com/package/langsys-js-svelte)
[![license](https://img.shields.io/npm/l/langsys-js-svelte.svg?style=flat)](./LICENSE)

Langsys revolutionizes localization for apps with easy to integrate, realtime, continuous translations. Read more about Langsys Translation Manager [at the website](https://Langsys.dev/).

Integrate the Langsys Translation Manager into your Svelte and SvelteKit applications using this SDK.

## Requirements

- **Svelte 5** with full SSR support in SvelteKit.

> The last version supporting Svelte 3 / 4 (client-side only) is tagged `v-last-svelte4-compat` (`1.2.1`).
>
> The last version with the `$_['Category']['Token']` proxy access pattern (Svelte 5) is tagged `v-last-proxy-compat` (`2.0.0`). v3 replaces it with `$t(phrase, category?, params?)` — see the [3.0.0 CHANGELOG](./CHANGELOG.md) for migration notes.

## How it's layered

As of v3.0.0, `langsys-js-svelte` is a thin Svelte binding over the framework-agnostic [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript) package — which owns the API client, translation lifecycle, token discovery, DOM tokenizer, and SSR-aware token strategies. This package adds only the Svelte-native concerns:

- A `LangsysApp` whose `init` accepts a Svelte `Writable<string>` for the user locale
- A `t` store you read with `$t('Phrase', 'Category')` — re-renders any subscribed template when translations or the loaded locale change
- Svelte 5 components wrapping the underlying DOM handlers: `<Translate>` (content blocks), `<Phrase>` (one markup-bearing sentence kept whole), `<DontTranslate>` (never translated)

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

Store **BCP 47 language tags** in it (`en-US`, `pt-BR`, `zh-Hant`). Casing and `_` separators are normalized for you, so `en_us` becomes `en-US`. A tag that isn't valid BCP 47 at all — `english`, `en-USA` — is passed through best-effort rather than rejected, which means it simply fails to match a catalog and the page renders base language. That looks exactly like a locale you haven't translated yet, so run with `debug: true` in development: the SDK warns on an invalid tag at the point where it can still tell the difference.

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

Allowed value types: `string | number | Date | boolean`. `number` and `Date` values are formatted for the active locale via CLDR — `1234.5` renders as `1,234.5` in `en-US` and `1.234,5` in `de-DE`; a `Date` renders in medium date style (`Mar 14, 2026` / `14.03.2026`). `string` values pass through untouched.

**ICU MessageFormat is supported** alongside the simple form, on the same signature — plural, select, and date/time/number skeletons all work:

```svelte
{$t('{count, plural, one {# item} other {# items}}', 'Cart', { count })}
{$t('{g, select, male {Bienvenido} female {Bienvenida} other {Bienvenide}}', 'UI', { g })}
```

You rarely need to write these yourself: Langsys promotes a plain `{name}` phrase to an ICU construct in target locales that require it — a gendered locale can grow a `select` argument your source phrase never had. When an argument the target expects isn't supplied, the SDK resolves `select` to its `other` branch and `plural` to `other` rather than rendering the raw construct.

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
- Recursively tokenizes text nodes, `<option>` text, and translatable attributes — `placeholder`, `alt`, `title`, `label`, the `aria-*` ones a screen reader speaks, and `data-*` validation messages among them. The canonical list is `TRANSLATABLE_ATTRIBUTES` in the base SDK's tokenizer and it grows, so treat these as examples rather than an exhaustive set.
- Translates `value` **only where it is a label rather than data**: on `<button>`, and on `<input type="submit">` / `<input type="button">`. Every other input type is left alone, so a text field's value is never rewritten. This is a separate mechanism from the attribute list above — `value` does *not* appear in `TRANSLATABLE_ATTRIBUTES`.
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

#### Interpolation with `params`

`<Translate>` accepts a `params` prop for runtime values. In markup, write placeholders with **percent delimiters — `%name%`** — not the single-brace `{name}` form:

```svelte
<script>
    import { Translate } from 'langsys-js-svelte';

    let name = $state('Sarah');
    let count = $state(3);
</script>

<Translate category="Dashboard" params={{ name, count }}>
    <p>Welcome back, %name%. You have %count% new messages.</p>
</Translate>
```

> [!IMPORTANT]
> **Use `%name%`, not `{name}`, inside `<Translate>`/`<Phrase>` content.** Svelte (like JSX) treats `{name}` in markup as its own expression tag and would substitute it *before* Langsys sees the text — silently breaking translation while still looking right in the base locale. The base SDK normalizes `%name%` back to canonical `{name}` at capture time, so **translators still only ever see `{name}`** and both spellings register the same content-block. Only simple identifiers between the percents are matched (`%[A-Za-z_][A-Za-z0-9_]*%`), so literal `%` in prose — "50% off", "width: 100%" — is left untouched. The braces on the `params={{ … }}` prop itself are normal Svelte and stay as-is. This is a markup-only concern: `$t('Hello, {name}!', { name })` keeps single braces because the placeholder lives in a JS string, not the template.

- Placeholders interpolate into translated text nodes **and** translatable attributes, after the lookup — so translators translate the phrase and the values drop in per locale.
- Unknown keys stay visible in canonical form (`%missing%` renders as `{missing}`) rather than blanked — matching `$t()`'s unknown-key behavior.
- `number` and `Date` values are formatted for the active locale via the base SDK's CLDR rules; `string` values pass through untouched.
- The prop is **reactive** — changing `params` (e.g. an updated `count`) re-renders via the underlying `setParams()`. The same `%name%` rule applies to `<Phrase>` for markup-bearing runs.
- **`debug: true` catches the mistake for you.** If you pass `params` whose keys match no placeholder in the content, the SDK warns and names the fix — that state is the fingerprint of having written `{name}` in markup and had the compiler eat it. ICU slots count as legitimate uses, the warning re-fires only when the params key-set changes (a ticking `count` won't spam the console), and it is silent in production.

`<Translate>` props: `category?`, `custom_id?`, `label?`, `tag?` (defaults to `translate`), `class?`, `params?`, `children`.

### `<Phrase>` — one sentence that happens to contain markup

`<Translate>` **splits**: it walks its subtree and registers each translatable run as its own phrase. That's right for prose, and wrong the moment a single sentence is broken up by inline markup — because the fragments land in separate catalog entries, and a translator can't move words across them.

```svelte
<!-- ❌ TWO separate mistakes here, both silent: -->
<!--    1. <strong> splits the sentence — "Based on" and "reviews" register as
           separate phrases, so no translation can move words between them.    -->
<!--    2. {reviewCount} is a Svelte expression, compiled away before Langsys
           sees the text — the count is baked into the registered phrase, and a
           new phrase registers every time it changes. Write %n% instead.      -->
<Translate category="ProductCard">
    <p>Based on <strong>{reviewCount}</strong> reviews</p>
</Translate>
```

Fixing it takes **both** changes — `<Phrase>` for the split, `%n%` for the placeholder. `<Phrase>` alone does not make the brace form safe: the compiler substitutes `{n}` before any Langsys component sees the text, inside `<Phrase>` exactly as inside `<Translate>`.

`<Phrase>` **keeps**: it encodes its whole subtree — inline markup and all — into a *single* phrase, registers that one string, then reconstitutes your real elements around the translated text.

```svelte
<script>
    import { Phrase } from 'langsys-js-svelte';
    let reviewCount = $state(4);
</script>

<Phrase category="ProductCard" params={{ n: reviewCount }}>
    Based on %n% <strong>reviews</strong>
</Phrase>
```

**This is a correctness requirement, not a formatting preference.** A count and the noun it inflects must live in the same phrase for grammatical agreement to be expressible. Split them, and no ICU plural rule can select the right form — English tolerates this (two forms, and "1 reviews" merely reads badly), but Russian has 4 plural categories, Polish 4, Arabic 6. If `%n%` and `reviews` are in different catalog entries, those languages simply cannot be translated correctly. `<Phrase>` is the only primitive that prevents it.

- **The markup never reaches the translator.** Inline elements are replaced with neutral tokens, so translators see one clean sentence and can reorder freely — the `<strong>` reattaches to whatever word it wraps in the target language.
- **Your scoped CSS never enters the phrase key** — which is why hand-rolling this goes wrong in Svelte specifically. Passing an element's `innerHTML` to `$t()` yourself puts markup in the key, and in Svelte that markup carries scoped-style hashes like `class="svelte-a1b2c3"`. Those hashes are content-derived, so they change whenever the component's styles change: the phrase key silently drifts on a build, the old key orphans, the new one registers untranslated, and the page falls back to the base language with no error anywhere. Every restyle would cost a retranslation. `<Phrase>` keeps the real elements inside the SDK as shallow clones and puts only neutral `{m0o}`/`{m0c}` tokens on the wire, so nothing build-specific can reach the key — and because those tokens are valid ICU argument names, plural/select still parse around them.
- **Composes with `<Translate>`.** A `<Phrase>` emits `data-ls-phrase`, which tells a wrapping `<Translate>` to skip that subtree and let `<Phrase>` own it — an internal marker the component sets for you, never something you write on an element yourself. The common pattern is `<Translate>` for the block, with `<Phrase>` around any run that must stay atomic.
- **Same `%name%` rule** as `<Translate>` — write `%n%`, not `{n}` (see the note above).
- Use it for: a count plus its noun, a sentence with a bolded or linked span, anything where word order must be free across the markup.

`<Phrase>` props: `category?`, `params?`, `tag?` (defaults to `span`), `class?`, `children`.

### `<DontTranslate>` — content that must survive verbatim

Marks a region as never-translated. Brand names, product names, domains, identifiers, code — anything that would be damaged by a well-meaning translation.

```svelte
<script>
    import { DontTranslate } from 'langsys-js-svelte';
</script>

<p>
    Built with <DontTranslate>Kangen®</DontTranslate> on
    <DontTranslate>langsys.dev</DontTranslate>
</p>
```

The host carries the standard [`translate="no"`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/translate) attribute, which the base SDK's tokenizer and renderer both honor — so the content is never tokenized, never registered, and never replaced. It's presentational glue with no vanilla handler behind it. As a bonus, `translate="no"` is the same signal browser-level translators (Chrome, Safari) respect, so the content is protected from those too.

`<DontTranslate>` props: `tag?` (defaults to `span`), `class?`, `children`.

### Hydrating markup rendered by langsys-php

If a Svelte app hydrates a page rendered by [`langsys-php`](https://github.com/langsys/langsys-php), both SDKs walk the same DOM — so it's worth knowing that the two use marker attributes with **inverted authorship**:

- **`data-ls-phrase` is ours and internal.** Our `<Phrase>` component emits it; you never write it yourself, and writing it on a plain element does not grant phrase semantics.
- **langsys-php's `data-langsys-*` attributes are author-written**, and so is `data-notrans` (its alias for `translate="no"`). Authors add them deliberately in PHP templates.

Our tokenizer honors both families, but only ever emits its own. For the PHP attributes' accepted values and exact semantics, see [langsys-php's documentation](https://github.com/langsys/langsys-php) rather than any restatement here — that surface is theirs and has moved more than once.

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
