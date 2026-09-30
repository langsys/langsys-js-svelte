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

- **Svelte 5**. Runs in SvelteKit under SSR — see [Server-Side Rendering](#server-side-rendering) for what that does and does not cover.

> The last version supporting Svelte 3 / 4 (client-side only) is tagged `v-last-svelte4-compat` (`1.2.1`).
>
> The last version with the `$_['Category']['Token']` proxy access pattern (Svelte 5) is tagged `v-last-proxy-compat` (`2.0.0`). v3 replaces it with `$t(phrase, category?, params?)` — see the [3.0.0 CHANGELOG](https://github.com/langsys/langsys-js-svelte/blob/main/CHANGELOG.md) for migration notes.

## How it's layered

As of v3.0.0, `langsys-js-svelte` is a thin Svelte binding over the framework-agnostic [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript) package — which owns the API client, translation lifecycle, token discovery, DOM tokenizer, and SSR-aware token strategies. This package adds only the Svelte-native concerns:

- A `LangsysApp` whose `init` accepts a Svelte `Writable<string>` for the user locale
- A `t` store you read with `$t('Phrase', 'Category')` — re-renders any subscribed template when translations or the loaded locale change
- Svelte 5 components: `<Translate>` (content blocks), `<Phrase>` (one markup-bearing sentence kept whole), `<DontTranslate>` (never translated)
- An optional build-time transform, `langsys-js-svelte/preprocess`, that turns the variables inside `<Translate>` and `<Phrase>` into placeholders — see [Variables in text](#variables-in-text--the-build-time-transform)

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

Store **BCP 47 language tags** in it (`en-US`, `pt-BR`, `zh-Hant`). Casing and `_` separators are normalized for you — to **lowercase**: `en_us`, `en-US` and
`EN-us` all become `en-us`. That lowercase form is what goes on the wire and what the SDK
compares internally, so a store holding `en-US` resolves to the same catalog entry rather
than fetching twice. A tag that isn't valid BCP 47 at all — `english`, `en-USA` — is passed through best-effort rather than rejected, which means it simply fails to match a catalog and the page renders base language. That looks exactly like a locale you haven't translated yet, so run with `debug: true` in development: the SDK warns on an invalid tag at the point where it can still tell the difference.

### Pointing the SDK at another API

`apiUrl` redirects every request — to a staging API, or to a test double in integration tests — without touching the built package. Defaults to `https://api.langsys.dev/api`.

```ts
await LangsysApp.init({ projectid, key, UserLocaleStore, apiUrl: 'http://langsys2.test/api' });
```

Pass it to `init()` rather than calling `LangsysAppAPI.setBaseUrl()`. `setBaseUrl` only works if it runs **before** `init()`; called after, the SDK has already authorized against the default host and stays inert for the life of the page — nothing throws, and translations simply never arrive. `apiUrl` is applied inside `init()`, before authorization, so the order cannot go wrong.

### SSR token strategy

`ssrTokenStrategy` (default `'client'`) controls when missing tokens are sent during server rendering:

- `'client'` (default) — the server collects **nothing**. Registration happens only from the browser, for content the browser actually renders. Cheapest, and the right default; but see the discovery gap below.
- `'server'` — tokens are sent immediately during SSR. Best for reliability and immediate registration.
- `'auto'` — small batches (≤5) sent from server, larger queued for client.

> [!IMPORTANT]
> **`'server'` requires your origin server's address to be allow-listed for the key.**
> Registrations under `'server'` originate from your server process, so the API sees your
> origin server's IP, not a visitor's. If that address is not allow-listed, the SDK makes zero
> registration attempts by design — no error, no request, nothing in the catalog, and no
> discovery hint. `'auto'` sends its small batches the same way and has the same precondition.

> **The discovery gap under `'client'`.** It is tempting to read "queue on the server,
> flush from the client" into this option — the SDK does not do that, and cannot. Under SSR
> the server instance declines to collect at all, and the post-hydration flush runs in the
> browser's own module instance, whose queue is a different object in a different process.
> Nothing is carried across.
>
> The practical consequence: **content that only ever renders on the server is discovered by
> neither lane.** A `+page.server.ts` branch the browser never takes, or markup behind a
> condition that is only true during SSR, will not register under `'client'` — and it leaves
> no trace, because there is no error and no hint. Use `ssrTokenStrategy: 'server'` for those
> pages, and note that it carries its own precondition: the flush then originates from your
> origin server's IP, which must be allow-listed for the key, or every registration is
> silently refused.

### Client-side navigation (SvelteKit)

Call `syncNavigation()` once in your root layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
    import { syncNavigation } from 'langsys-js-svelte/kit';
    syncNavigation();
</script>
```

A layout stays mounted across client-side navigation, and nothing re-evaluates its `$t(...)`
calls when only the route changes. After each navigation `syncNavigation()` tells the SDK the
route changed, so content that is still mounted is looked up again and its misses are recorded
for the new URL. It sends nothing itself.

Without it, a phrase rendered in a layout — a header, a nav, a footer, any persistent component —
is attributed to the **first** URL of the session and to no other: it still registers, but
discovery cannot tell you which other pages carry it. Page-level content remounts on every
navigation and is attributed correctly either way.

It lives in `langsys-js-svelte/kit` because it uses SvelteKit's `afterNavigate`; the main entry
never imports `$app/*`. With another router, call `notifyNavigation()` — exported from the main
entry — from that router's after-navigation hook.

## Variables in text — the build-time transform

Add one line to `svelte.config.js`, and put it **last** in the list — it reads the markup the other preprocessors produce:

```js
// svelte.config.js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { langsysPreprocess } from 'langsys-js-svelte/preprocess';

export default {
    preprocess: [vitePreprocess(), langsysPreprocess()],
    // …
};
```

It works the same under SvelteKit and plain Vite, and changes nothing outside `<Translate>`, `<Phrase>` and ``$t(`…`)`` template literals.

**Why it exists.** Svelte compiles `<p>Hello {user.name}</p>` into code that writes the name straight into the DOM, so at runtime nothing separates the word `Hello` from the value after it. Langsys needs that separation: a sentence must register once, as `Hello {name}`, with the value passed as a param. If it registers as `Hello Ana`, every user becomes a phrase of their own — translated, charged and never merged — and a sentence with no placeholder cannot be given a plural or gendered form in a target language. The source still shows which text is a variable, so the transform reads it there, at build time.

**What it does.** Inside every `<Translate>` and `<Phrase>` imported from this package, each `{expression}` becomes a named placeholder, and its value, typed as your code holds it, becomes a param:

| You write                          | Registers                      | Param                                     |
| ---------------------------------- | ------------------------------ | ----------------------------------------- |
| `Hello {firstName}`                | `Hello {first_name}`           | `first_name`                              |
| `Hi {user.name}`                   | `Hi {name}`                    | `name`                                    |
| `You have {items.length} items`    | `You have {items_count} items` | `items_count` (a number, so plurals work) |
| `Total {formatPrice(order.total)}` | `Total {total}`                | `total`                                   |
| `{a} and {a}`                      | `{a} and {a}`                  | one `a`                                   |

The names follow the rules every Langsys SDK shares, so the same expression gives the same phrase whichever SDK renders it: a value that cannot be named — `{a + b}`, `{ok ? x : y}` — becomes `{value}` with a build warning, and a name you write yourself wins (`%name%` in the text with `params={{ name }}`). `{#if}` and `{#key}` blocks are read branch by branch. Event handlers, classes and other attributes stay on their elements. A `<Phrase>`, `<Translate>` or `<DontTranslate>` inside a block is part of it.

The block is then rendered through the core's block renderer, so it is **translated in the served HTML** during SSR, not only after hydration, and its host carries its id (`data-ls-contentblock`).

``$t(`Hello ${user.name}`)`` is rewritten the same way, to `$t('Hello {name}', undefined, { name: user.name })`.

**What it cannot read** — an `{#each}`, an `{#await}`, `{@html}`, a snippet, another component, a directive (`bind:`, `use:`, `class:`), a spread — makes that block a **fallback**: the build names it in a warning, and the block renders as below.

**Without the transform**, and for a fallback block, `<Translate>` and `<Phrase>` still render every translation the catalog holds, but **register nothing** — on the server and in the browser — because nothing at runtime can tell a variable from the text around it. One debug notice (with `debug: true`) names the transform. `$t()` is unaffected: its phrase is a string you wrote.

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

The **phrase itself is the lookup key** _and_ the base-language default — there's no separate keys file to maintain. The first render of a phrase registers it in the Translation Manager (when using a write key); from then on, translations are fetched and rendered automatically as locales change.

#### Interpolation

Curly-brace placeholders are substituted from the params argument:

```svelte
<p>{$t('You have {count} new messages', 'Notifications', { count: 3 })}</p>
```

Placeholder names are extracted from the phrase at compile time and **type-checked**: omitting a required key or adding an extra one is a TypeScript error. With the [build-time transform](#variables-in-text--the-build-time-transform), a template literal — ``$t(`You have ${count} new messages`)`` — is rewritten into this form for you.

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

Different categories give the _same_ phrase different translations:

```svelte
<strong>{$t('Home', 'Main Menu')}</strong>      <!-- "Inicio" in Spanish -->
<strong>{$t('Home', 'Home repairs')}</strong>   <!-- "Hogar" in Spanish -->
```

Without categorization, "Home" would only have one translation — which can't work for both contexts. Langsys's philosophy is _translate once, use everywhere_; categorize when the same phrase legitimately means different things.

A good rule for category names: the module or feature the phrase lives in (`Account`, `Errors`, `Checkout`, `UI`).

### `<Translate>` — HTML content blocks

For larger blocks of HTML where the structure should be preserved for the translator:

```svelte
<script>
    import { Translate } from 'langsys-js-svelte';
    let user = $state({ name: 'Sarah' });
</script>

<Translate category="Blog" tag="article">
    <h1 class="title">My article title</h1>
    <p>Welcome back, {user.name}. My content <strong>is the best</strong> when internationalized by Langsys.</p>
    <p>Translators see this exactly as users do — same styling, same structure.</p>
</Translate>
```

The component:

- Tokenizes text, `<option>` text, and translatable attributes — `placeholder`, `alt`, `title`, `label`, the `aria-*` ones a screen reader speaks, and `data-*` validation messages among them. The canonical list is `TRANSLATABLE_ATTRIBUTES` in the base SDK's tokenizer and it grows, so treat these as examples rather than an exhaustive set.
- Translates `value` **only where it is a label rather than data**: on `<button>`, and on `<input type="submit">` / `<input type="button">`. Every other input type is left alone, so a text field's value is never rewritten. This is a separate mechanism from the attribute list above — `value` does _not_ appear in `TRANSLATABLE_ATTRIBUTES`.
- Captures semantic CSS so translators see the styled appearance in the Translation Manager.
- Registers the whole thing as a **content block** that translators handle as one unit while still translating the individual phrases inside — with each variable as a placeholder, through the [build-time transform](#variables-in-text--the-build-time-transform).
- Re-renders on locale change.

With the transform, the block is rendered from its content as a tree: translated in the served HTML, its host stamped with its id, event handlers and bindings to state kept on their elements, and `{#if}` branches rendered as Svelte renders them. A block the transform cannot read, or any block without it, is translated by the base SDK's DOM handler after mount and registers nothing.

Use `<Translate>` for prose, marketing copy, forms with placeholders — anything where the structure matters. Use `$t()` for individual strings.

#### Values and `params`

With the transform, write values as you would anywhere in Svelte — `{name}`, `{items.length}` — and they become placeholders with typed params. To name a placeholder yourself, write it with **percent delimiters — `%name%`** — and pass the value in `params`; this form works with or without the transform, and a name written this way wins:

```svelte
<Translate category="Dashboard" params={{ name, count }}>
    <p>Welcome back, %name%. You have %count% new messages.</p>
</Translate>
```

`{name}` cannot be written as literal text in Svelte markup — Svelte reads it as an expression — which is why the explicit form uses percents. The base SDK normalizes `%name%` to canonical `{name}`, so **translators only ever see `{name}`**. Only simple identifiers between the percents are matched (`%[A-Za-z_][A-Za-z0-9_]*%`), so literal `%` in prose — "50% off", "width: 100%" — is left untouched.

- Values interpolate into translated text **and** translatable attributes, after the lookup — translators translate the phrase and the values drop in per locale.
- A number reaches the translation as a number, so a plural form a translation grows (`{count, plural, one {…} other {…}}`) selects correctly.
- `number` and `Date` values are formatted for the active locale via the base SDK's CLDR rules; `string` values pass through untouched.
- Unknown keys stay visible in canonical form (`%missing%` renders as `{missing}`) rather than blanked — matching `$t()`'s unknown-key behavior.
- The values are **reactive**: a changed `count` re-renders the block.
- **`debug: true`** warns when `params` has keys that match no placeholder in the content, and names each block the transform could not read.

`<Translate>` props: `category?`, `custom_id?`, `label?`, `tag?` (defaults to `translate`), `class?`, `params?`, `children`.

#### Blocks the transform cannot read

> [!WARNING]
> **A fallback block whose whole content is a single phrase stops updating once Svelte tries to change it.** This applies to blocks the transform cannot read (an `{#await}` or `{#each}` inside, a component, a directive) and to every block in an app without the transform — the base SDK's DOM handler translates those after mount.
>
> The cause is in that handler: when a block tokenizes to exactly one phrase, it writes the translation back with `element.innerText = …`. That assignment replaces **every child** of the host, including the `<!--[-->` / `<!--]-->` anchor comments Svelte 5 uses to find the block again. Svelte's next update targets nodes that are no longer in the document, so it succeeds silently and changes nothing.
>
> Measured against `langsys-js-typescript@0.6.5`, without the transform:
>
> | content                                                      | client-only           | hydrated   |
> | ------------------------------------------------------------ | --------------------- | ---------- |
> | `{#if flag}…{:else}…{/if}` (one phrase per branch)           | **frozen**            | **frozen** |
> | a single reactive expression, e.g. `{msg}`                   | **frozen**            | **frozen** |
> | the same two driven by a **store** (`{$msg}`, `{#if $flag}`) | **frozen**            | **frozen** |
> | `{#await}`                                                   | **registers nothing** | **frozen** |
> | two or more phrases in the subtree                           | fine                  | fine       |
>
> With the transform, `{#if}` and reactive expressions are part of the tree, which Svelte itself renders, so the first three rows do not arise. `{#await}` is always a fallback.
>
> **Keep the async boundary outside the block, and wrap the resolved content:**
>
> ```svelte
> <!-- ✅ the block only ever sees settled content -->
> {#await load()}
>     Loading…
> {:then page}
>     <Translate category="Docs"><p>{page.title}</p></Translate>
> {/await}
> ```
>
> ```svelte
> <!-- ❌ a fallback: freezes on "Loading…" -->
> <Translate category="Docs">
>     {#await load()}Loading…{:then page}{page.title}{/await}
> </Translate>
> ```

### `<Phrase>` — one sentence that happens to contain markup

`<Translate>` **splits**: it registers each translatable run as its own phrase. That's right for prose, and wrong the moment a single sentence is broken up by inline markup — because the fragments land in separate catalog entries, and a translator can't move words across them.

```svelte
<!-- ❌ <strong> splits the sentence: "Based on", the count and "reviews" register as
        separate phrases, so no translation can move words between them. -->
<Translate category="ProductCard">
    <p>Based on <strong>{reviewCount}</strong> reviews</p>
</Translate>
```

`<Phrase>` **keeps**: it encodes its whole subtree — inline markup and all — into a _single_ phrase, registers that one string, then rebuilds your real elements around the translated text.

```svelte
<script>
    import { Phrase } from 'langsys-js-svelte';
    let reviewCount = $state(4);
</script>

<Phrase category="ProductCard">Based on {reviewCount} <strong>reviews</strong></Phrase>
```

With the transform this registers `Based on {review_count} {m0o}reviews{m0c}` once, whatever the count; without it, write `%n%` with `params={{ n: reviewCount }}` for the same phrase, which then renders from the catalog and registers nothing.

**This is a correctness requirement, not a formatting preference.** A count and the noun it inflects must live in the same phrase for grammatical agreement to be expressible. Split them, and no ICU plural rule can select the right form — English tolerates this (two forms, and "1 reviews" merely reads badly), but Russian has 4 plural categories, Polish 4, Arabic 6. If the count and `reviews` are in different catalog entries, those languages simply cannot be translated correctly. `<Phrase>` is the only primitive that prevents it.

- **The markup never reaches the translator.** Inline elements are replaced with neutral tokens, so translators see one clean sentence and can reorder freely — the `<strong>` reattaches to whatever word it wraps in the target language.
- **Your scoped CSS never enters the phrase key** — which is why hand-rolling this goes wrong in Svelte specifically. Passing an element's `innerHTML` to `$t()` yourself puts markup in the key, and in Svelte that markup carries scoped-style hashes like `class="svelte-a1b2c3"`. Those hashes are content-derived, so they change whenever the component's styles change: the phrase key silently drifts on a build, the old key orphans, the new one registers untranslated, and the page falls back to the base language with no error anywhere. `<Phrase>` puts only neutral `{m0o}`/`{m0c}` tokens in the phrase, so nothing build-specific can reach the key — and because those tokens are valid ICU argument names, plural/select still parse around them.
- **Composes with `<Translate>`.** A `<Phrase>` emits `data-ls-phrase`, which tells a wrapping `<Translate>` to leave that run to it — an internal marker the component sets for you, never something you write on an element yourself. The common pattern is `<Translate>` for the block, with `<Phrase>` around any run that must stay atomic.
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

### Server messages — validation errors and system messages

A Langsys server SDK leaves your framework's error response as it is and attaches translation
entries beside it — each carrying the untranslated sentence as `template`, its `params`, the
filled `message`, and the framework's own `field` and `code`. Tell `resolveServerMessages` where
the entries sit, and render each through `$serverMessage`:

```svelte
<script lang="ts">
    import { resolveServerMessages, serverMessage } from 'langsys-js-svelte';

    let { body } = $props(); // e.g. a failed form's JSON response
    // `key` is the path your server attaches the entries under (Laravel: "langsys_errors").
    const entries = $derived(resolveServerMessages(body, { key: 'langsys_errors' }));
</script>

{#each entries as entry}
    <p class="error" data-field={entry.field}>{$serverMessage(entry)}</p>
{/each}
```

`resolveServerMessages` reads only where you point it — a `key`, or a `resolver` function that
maps your own error shape to entries — and throws if given neither. It never searches the body.

`$serverMessage(entry)` shows the translation of the entry's `template`, filled from `params`,
when the catalog has one, and the entry's `message` otherwise. `message` is never used as a
lookup key. Templates are looked up under one category, `Errors` unless you set
`messagesCategory` in `init()`; it must match the category the server registers them under.
`code` is your framework's own identifier for the failure, passed through unchanged: branch your
logic on it, never on the text.

The store re-renders when the catalog or locale changes, exactly as `$t` does. Calling
`renderServerMessage(entry)` directly renders once and does not update.

**Inertia.** A server adapter that redirects after a failed form shares the entries as a page
prop beside the framework's own `errors`, which it leaves untouched. Pass that prop's name as
`key`: `resolveServerMessages(pageProps, { key: 'langsys_errors' })`.

## Reactive stores

| Export                  | Type                             | Notes                                                                                                                                                 |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `t`                     | `Signal<TFunction>`              | Re-emits whenever translations or locale change. Use as `$t('Phrase', 'Cat')`. Never write to it.                                                     |
| `currentlyLoadedLocale` | `Signal<string>`                 | The locale whose translations are currently loaded (lags `UserLocaleStore` until the fetch completes).                                                |
| `sTranslations`         | `Signal<iCategories>`            | The raw translation catalog.                                                                                                                          |
| `writeEnabled`          | `Readable<boolean \| undefined>` | Whether the server has granted this session permission to register content. **Tri-state**, and the one store that is genuinely READ-ONLY — see below. |

`Signal<T>` structurally satisfies Svelte's `Readable<T>` contract — `subscribe` fires
immediately — so you read all three with `$store` syntax and no adapter.

`currentlyLoadedLocale` and `sTranslations` are also **writable**: `.set()` is public, and
they are process-global. That is not a detail to route around — writing them is the
documented mechanism for server-rendering translated copy, described next.

### `writeEnabled` and write grants

Public API keys are read-only. The server decides **per session** whether a session may
register newly-discovered content, because the same key can be write-enabled from one
network and read-only from another — so nothing on the client can infer it.

```svelte
{#if $writeEnabled === undefined}
    <span>checking…</span>       <!-- not known yet: authorization hasn't resolved -->
{:else if $writeEnabled}
    <span>content capture on</span>
{:else}
    <span>read-only session</span>
{/if}
```

`undefined` means _not known yet_ and is genuinely different from `false`. It is what the
store reports during SSR and throughout hydration, and treating it as `false` would tell a
write-enabled session it is read-only — a state it cannot recover from without a reload.

For authenticated apps, your backend mints a short-lived JWT at login and the SDK sends it
as `X-Write-Grant`, which lets the server treat the session as write-enabled:

```ts
import { writable } from 'svelte/store';
import { LangsysApp } from 'langsys-js-svelte';

const writeGrant = writable('');          // a Svelte store works directly

await LangsysApp.init({ projectid, key, UserLocaleStore, writeGrant });

// The grant is a short-lived token. Refresh by writing to the store — it is resolved
// per request, never cached, so the next request uses the new value.
writeGrant.set(await fetchFreshGrant());
```

`writeGrant` accepts a plain `string`, a provider function
(`() => string | null | undefined | Promise<…>`), or — Svelte only — a store. Prefer a
store or a provider over a bare string: a string is stale the moment the token expires.
`null`/`undefined` are valid, meaning "no grant yet" (e.g. before login).

If the token only exists after `init()`, supply it later. This re-authorizes, so `await`
it if you need `$writeEnabled` settled before your next step:

```ts
await LangsysApp.setWriteGrant(token);
```

Types: `WriteGrant` (the base-SDK union) and `WriteGrantSource` (that union plus a Svelte
store) are both re-exported.

## Server-Side Rendering

The main pattern is to pre-fetch translations server-side and seed them through `initialTranslations` / `initialTranslationsLocale` so the client doesn't refetch on hydration.

Be clear on what that buys you. `init()` runs in `onMount`, which does not execute during SSR, so **the server HTML renders base language** and the client corrects it at hydration. Seeding removes the client's _second_ catalog fetch and the flash that fetch caused — it does not, on its own, server-render translated copy.

If you need the server HTML itself translated, there is a second pattern: seed the catalog signals synchronously in a **layout component body**. `$t()` then resolves during SSR. It is safe because Svelte's server renderer, **in its default mode**, cannot yield — a layout and its page render in one uninterrupted pass — measured clean across 400 requests with 8 locales in flight together, and it also removes the stale-locale flash a returning visitor would otherwise see. It must be the component body: seeding in a `hooks.server.js` hook bled 70 of 80 requests into the wrong language.

Three conditions ride along with that pattern, and none of them is optional:

- **Seed on every request, unconditionally.** The signals are process-global and, during SSR, the layout body is the only write — so a request that skips the seed renders with whatever the _previous_ request left behind. That is how Italian gets served under `<html lang="es-ES">`.
- **A failed catalog fetch must fall back to `{}` in `load`, never `null` or `undefined`.** `$t()` reads `catalog[category][phrase]` and the optional chain is on the _second_ hop, so a nullish catalog throws on the first lookup: a 500 during SSR, and the same throw again at hydration. An empty object falls back to base language, which is what you want.
- **Keep Svelte's default synchronous SSR.** `compilerOptions.experimental.async` switches to a renderer that awaits mid-tree, which voids the guarantee this whole pattern rests on — the same cross-request bleeding as the hook placement, reintroduced by a config flag with no change to any component.

The two failure modes are not equally visible, which is the part worth planning around. A **skipped seed** is invisible from a cold process: with nothing cached yet it falls back to base language and looks correct, so it only appears once the process is warm — test it warm. A **nullish catalog** is the opposite, a 500 on the first lookup, but only once a catalog fetch actually fails, which is rarely the day you ship.

Full detail, the measurements behind those numbers, and the SEO and troubleshooting consequences are in the SSR guide.

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

// Matched against the locales YOUR PROJECT is configured for — exact tags.
// Don't build this list from getLocalesFlat(): that returns every locale Langsys
// knows (~570 CLDR entries), so nearly any Accept-Language "matches" and you end
// up storing a locale your project has no catalog for.
const supportedLocales = ['en-US', 'es-CR', 'fr-FR', 'it-IT'];
const locale = LangsysApp.detectPreferredLocale(
    request.headers.get('Accept-Language'),
    supportedLocales,
);
```

The matcher tries exact match first (e.g. `en-US`), then language-only (`en` matches `en-GB`). When you pass `supportedLocales` and none match, it falls back to the user's top preference (normalized); it returns `false` only when no preference can be determined at all.

### Waiting for translations to load

When changing locale mid-session, you may want to re-run dependent code once the fetch has settled:

```svelte
<script>
    import { LangsysApp } from 'langsys-js-svelte';

    import { currentlyLoadedLocale } from 'langsys-js-svelte';

    // Depend on the loaded-locale store so this re-runs on each locale change.
    // `translationsLoadingPromise` is a plain field, not reactive — an $effect that
    // only referenced it would register no dependency and run once, at mount.
    $effect(() => {
        void $currentlyLoadedLocale;
        LangsysApp.translationsLoadingPromise.then(() => {
            // re-render content / regenerate UI here
        });
    });
</script>
```

> [!WARNING]
> **This promise settling does not mean translations arrived.** It resolves identically
> whether the catalog fetch succeeded or failed — on failure the SDK logs and returns
> without writing a catalog, and the promise still resolves. It also resolves without
> fetching at all when the locale is unchanged and within the 60-second cache window.
> So treat it as **"the attempt is over"**, not as "the translations are here".
>
> The two signals answer different questions and neither answers both: the promise is
> the only "it ended" signal, and `currentlyLoadedLocale` matching the locale you asked
> for is the only "it worked" signal. Use a **match as the only positive** — and do not
> derive failure from a mismatch, for two reasons. `currentlyLoadedLocale` is written
> only on the success path, so a failed fetch never updates it. And on success it is
> written inside a 100 ms timer, so for ~100 ms after a _successful_ load the catalog
> is already new while the locale still reads old — an equality check treated as an
> error condition will report failure on every normal locale switch, then flip.
>
> **There is no reliable failure signal.** A fetch that failed and one that succeeded
> 50 ms ago are indistinguishable from outside: both have a resolved promise and an
> un-updated locale. If you need an error state, supply your own timeout.

## Migrating from v2.x

The v2.x proxy-based API was replaced in v3.0.0 with `$t()`. See the [CHANGELOG](https://github.com/langsys/langsys-js-svelte/blob/main/CHANGELOG.md) for the full diff.

Quick conversion:

```svelte
<!-- v2.x -->
<h1>{$_['UI']['Title']}</h1>

<!-- v3.0+ -->
<h1>{$t('Title', 'UI')}</h1>
```

Note the order: the proxy was `$_[category][phrase]`, while `$t()` takes the **phrase first, then the category** — `$_['UI']['Title']` becomes `$t('Title', 'UI')`. The win is that `$t()` accommodates interpolation cleanly and is type-checked at the call site. The change is mechanical and codemod-friendly.
