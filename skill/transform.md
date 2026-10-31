# The build transform: `langsysPreprocess()`

```js
// svelte.config.js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { langsysPreprocess } from 'langsys-js-svelte/preprocess';

export default {
    preprocess: [vitePreprocess(), langsysPreprocess()],
    // …
};
```

- **Put it last.** It reads the markup the other preprocessors produce.
- **It works the same under SvelteKit and Svelte on Vite**, and changes nothing outside `<Translate>`, `<Phrase>` and `` $t(`…`) `` template literals.

## Why it's needed

Svelte compiles `<p>Hello {user.name}</p>` into code that writes the name straight into the DOM. At runtime nothing separates `Hello` from the value after it, so a block read from the DOM would register `Hello Ana`, `Hello Luis` and one more phrase per user, which is the core's fifth invariant (`node_modules/langsys-js-typescript/skill/invariants.md`). The source still shows which text is a variable, so the transform reads it there, at build time.

**Without it, `<Translate>` and `<Phrase>` register nothing**, on the server or in the browser. They still render every translation the catalog holds. With `debug: true`, one notice names the transform. `$t()` registers as before.

## What it does

Inside every `<Translate>` and `<Phrase>` imported from this package, each `{expression}` becomes a named placeholder, and its value, typed as your code holds it, becomes a param:

| You write | Registers | Param |
|---|---|---|
| `Hello {firstName}` | `Hello {first_name}` | `first_name` |
| `Hi {user.name}` | `Hi {name}` | `name` |
| `You have {items.length} items` | `You have {items_count} items` | `items_count`, a number, so a plural form can choose |
| `Total {formatPrice(order.total)}` | `Total {total}` | `total` |

- **The names are the core's** (`derivePlaceholderNames`, in `node_modules/langsys-js-typescript/skill/value-markers.md`), so the same expression gives the same phrase in every Langsys SDK. A value that can't be named, such as `{a + b}`, becomes `{value}` with a build warning.
- **A name you write wins.** Write `%name%` and pass the value in `params`; it works with or without the transform. A `%name%` anywhere in the unit, in its text or an attribute, is yours, and so is `{name}` written as text through character references (`&lbrace;name&rbrace;`). A value the transform names never takes it.
- **`{#if}` and `{#key}` are read branch by branch.** Event handlers, classes and other attributes stay on their elements. In a `<Phrase>`, an element's attributes aren't part of the phrase.
- **A `<Phrase>` or `<Translate>` inside a block is a unit of its own.** It names its values among themselves, so it registers what it would standing alone, and it renders with its own values and its own `params`, never the block's. The props it may carry there are listed below.
- **`` $t(`Hello ${user.name}`) ``** is rewritten to `$t('Hello {name}', undefined, { name: user.name })`. A key you write in an object argument is a name you chose: `` $t(`Hello ${name}`, { name: nickname }) `` registers `Hello {name_2}`.

## Options

| Option | Default | What it does |
|---|---|---|
| `from` | `['langsys-js-svelte']` | The module specifiers `Translate`, `Phrase` and `t` are imported from. A component imported from anywhere else is left alone |
| `warn` | `console.warn` | Receives each build warning |

An app that re-exports the components from a module of its own lists that module too, and the default with it, since `from` replaces the default: `langsysPreprocess({ from: ['langsys-js-svelte', '$lib/i18n'] })`.

## Blocks it can't read

A block holding any of these is a **fallback**: the build names it in a warning, and the block renders as it would without the transform, translated after mount and registering nothing.

- an `{#each}`, an `{#await}`, a `{#snippet}`, a `{@render}` or a `{@const}`;
- another component, or one of Svelte's special elements, such as `<svelte:element>` or `<svelte:boundary>`;
- an `<svg>`, `<math>`, `<textarea>`, `<template>`, `<script>` or `<style>` element, such as an icon inside a link;
- on any element, a directive (`bind:`, `use:`, `class:`, `style:`, a transition or an animation), an `{@attach}` or a spread;
- `{@html}` beside a variable;
- a `translate` or `data-notrans` attribute whose value is an expression;
- an `<input>` whose `type` is an expression, beside a `value` holding text;
- a nested `<Translate>` or `<Phrase>` with a prop other than these: `tag` and `custom_id` written as text, `class`, `params`, and `category` when it is the block's own. A `label`, or a `category` of its own, makes the enclosing block a fallback.

Restructure so each unit is readable: put the `<Translate>` or `<Phrase>` inside the `{#each}` rather than around it, keep components and bound inputs outside the block or in a block of their own, and give a link or a button with an icon its text through `$t` or a `<Phrase>` around the text alone. A `<Translate>` or `<Phrase>` nested inside a fallback block that the build can read is still read on its own.

**Raw HTML is content.** A block whose only dynamic parts are `{@html}` insertions, such as a CMS field, holds text to translate, not a variable. It registers the HTML's text as the page shows it, after mount, and a server render serves it as source. Mark any per-user value inside that HTML where the HTML is produced (`node_modules/langsys-js-typescript/skill/value-markers.md`). This also needs the transform: without it, nothing at runtime tells an `{@html}` block from one that interpolates.

**Content kept out stays out.** Inside a `<DontTranslate>`, or an element written with `translate="no"` or `data-notrans`, nothing is read, and a `<Phrase>` or `<Translate>` there registers nothing. The build reads only an exclusion written on the element: one a spread applies, or another component applies to its own elements, is decided at runtime, so a unit inside it is read and registers.

## Checking it worked

1. Build and read the warnings: each fallback block and each unnamed value is named there.
2. Run with `debug: true` and confirm there's no notice naming the transform and no unmatched-params warning.
3. In the Translation Manager, confirm the registered phrases hold `{name}` placeholders, never values.
