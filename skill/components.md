# `$t` and the components

Which primitive a piece of content needs is the core's question, answered in `node_modules/langsys-js-typescript/skill/primitives.md`: plain text is `t()`, one sentence with inline markup is a `Phrase`, a block of separate units is a `Translate`. This file is how each one is written in Svelte.

## `$t`

```svelte
<script lang="ts">
    import { t } from 'langsys-js-svelte';

    let { name }: { name: string } = $props();
</script>

<h1>{$t('Welcome back', 'Home')}</h1>
<p>{$t('Hello, {name}!', 'Home', { name })}</p>
```

- **`$t(phrase, category?, params?)`** is the core's `t()`, read from the `t` store, so the markup re-renders on every catalog or locale change. Its signature, types and placeholder rules are the core's (`node_modules/langsys-js-typescript/skill/interpolation.md`).
- **`{name}` inside the string is the core's placeholder.** It is a JavaScript string, so Svelte never reads it as an expression.
- **It registers with or without the build transform**, because its phrase is a string you wrote.
- **With the transform, a template literal is rewritten** into the placeholder form: `` $t(`Hello ${user.name}`) `` becomes `$t('Hello {name}', undefined, { name: user.name })`. Without it, the same literal builds one phrase per value, which the core's first invariant forbids. Write the placeholder form either way.

## `<Translate>`

```svelte
<script lang="ts">
    import { Translate } from 'langsys-js-svelte';

    let { user }: { user: { name: string } } = $props();
</script>

<Translate category="Blog" tag="article" label="Welcome post">
    <h1 class="title">Welcome back, {user.name}</h1>
    <p>My content <strong>is the best</strong> when it's translated.</p>
</Translate>
```

| Prop | Default | What it does |
|---|---|---|
| `category` | none | The block's category |
| `custom_id` | none | Registers the block under this id instead of the one derived from its content |
| `label` | none | What translators see the block called |
| `tag` | `translate` | The host element. The default is an unknown element, which renders inline: pass `div`, `section` or `article` for block content |
| `class` | none | The host's class |
| `params` | none | Values for `%name%` placeholders written in the content |
| `children` | none | The content |

**With the build transform**, each `{expression}` is a named placeholder and the block is rendered from its content as a tree, through the core's `renderBlock`, on the server as in the browser:

- Inside `createLangsysHandle`'s request scope the served HTML is already translated, and the host carries the block's id as `data-ls-contentblock` ([sveltekit.md](./sveltekit.md)).
- The elements are the component's own, so its scoped styles apply to them, and their event handlers and the attributes that read state stay on them.
- It registers once, with each value as a placeholder: on the server inside a request scope, which sends it after the response when the strategy collects there, and otherwise from the browser after mount.
- A value that changes re-renders the block.

**Without the transform, and for a block the transform can't read**, the core's DOM `Translate` translates the rendered DOM after mount and registers nothing. On the server it renders the source. The blocks the transform can't read are in [transform.md](./transform.md).

## `<Phrase>`

```svelte
<script lang="ts">
    import { Phrase } from 'langsys-js-svelte';

    let reviewCount = $state(4);
</script>

<Phrase category="ProductCard">Based on {reviewCount} <strong>reviews</strong></Phrase>
```

| Prop | Default | What it does |
|---|---|---|
| `category` | none | The phrase's category |
| `tag` | `span` | The host element |
| `class` | none | The host's class |
| `params` | none | Values for `%name%` placeholders written in the content |
| `children` | none | The sentence |

- **With the transform** this registers `Based on {review_count} {m0o}reviews{m0c}` once, whatever the count, with the count as a number param, so a plural form can choose the noun's form. It renders through the core's `renderBlock` on the server as in the browser.
- **Without it**, write the placeholder yourself: `Based on %review_count% <strong>reviews</strong>` with `params={{ review_count: reviewCount }}`. It renders that phrase's translation and registers nothing. `review_count` is the name the transform gives `reviewCount`, so adding the transform later keeps the phrase.
- **The host carries `data-ls-phrase`**, which the core's `Phrase` class leaves to the HTML. So a `<Phrase>` inside a `<Translate>` is a unit of its own with no attribute to write: the block leaves its run to it.

## `<DontTranslate>`

```svelte
<script lang="ts">
    import { DontTranslate } from 'langsys-js-svelte';
</script>

<p>Built with <DontTranslate>Kangen®</DontTranslate> on <DontTranslate>langsys.dev</DontTranslate></p>
```

| Prop | Default | What it does |
|---|---|---|
| `tag` | `span` | The host element |
| `class` | none | The host's class |
| `children` | none | The content kept as written |

Its host carries `translate="no"`, so everything inside is the core's opt-out (`node_modules/langsys-js-typescript/skill/primitives.md`). Inside a `<Translate>` or `<Phrase>` it stays part of the block's markup and is never translated.

## Server messages: `$serverMessage`

```svelte
<script lang="ts">
    import { resolveServerMessages, serverMessage } from 'langsys-js-svelte';

    let { body }: { body: unknown } = $props();   // a failed request's JSON response
    const entries = $derived(resolveServerMessages(body, { key: 'langsys_errors' }));
</script>

{#each entries as entry}
    <p class="error" data-field={entry.field}>{$serverMessage(entry)}</p>
{/each}
```

`$serverMessage(entry)` renders an entry as the core's `renderServerMessage()` does, and re-renders on every catalog or locale change, as `$t` does. Calling `renderServerMessage(entry)` directly renders once. Where the entries come from, what each one holds and which category they're looked up in are the core's (`node_modules/langsys-js-typescript/skill/catalog.md`).
