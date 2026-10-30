---
name: langsys-svelte
description: The Langsys Svelte skill, for langsys-js-svelte on Svelte 5 and SvelteKit. Part of the Langsys skill set, read in order - the entry skill langsys first, then the core skill langsys-typescript (installed with this package, at node_modules/langsys-js-typescript/skill/SKILL.md), then this one. Covers only what Svelte changes - install, LangsysApp.init with a Svelte store, the $t store, writeEnabled and write grants as stores, the Translate, Phrase and DontTranslate components, the langsysPreprocess() build transform (without it the components register nothing), and SvelteKit's createLangsysHandle, hydrateFromServer and syncNavigation.
metadata:
  package: langsys-js-svelte
  version: 4.0.0
---

# Langsys Svelte

<!-- langsys-skill-preamble:start -->
**This skill is one part of the Langsys skill set.** Read the set in this order, and never skip a step:

1. **`langsys`**, the entry skill: what Langsys is, choosing the SDKs, the project, API keys and secrets, and the rules every Langsys SDK shares.
2. **The core skill of the SDK's language**: `langsys-typescript` for JavaScript and TypeScript, `langsys-php` for PHP. It holds what is true for every framework in that language.
3. **The framework's own skill**, such as `langsys-svelte` or `langsys-laravel`. It adds only what its framework changes.

The entry skill isn't installed with any SDK. If `langsys` isn't among your skills, read it at https://docs.langsys.dev/skill/langsys/. If you can't reach that page, tell the user to run `npx langsys-skill install`, which installs it with the skill of every Langsys package in the project.
<!-- langsys-skill-preamble:end -->

This is `langsys-svelte`, step 3 for Svelte and SvelteKit. It describes `langsys-js-svelte` at the version in its frontmatter. Check the installed version first (`npm ls langsys-js-svelte`). If it differs, say so before relying on anything here.

**Read the core skill before this one.** `langsys-typescript` ships in `langsys-js-typescript`, which this package depends on, so it is always installed: `node_modules/langsys-js-typescript/skill/SKILL.md`, or the `langsys-typescript` skill where `npx langsys-skill install` copied it. It holds every rule this binding keeps: choosing between `t()`, `Phrase` and `Translate`, the invariants, who may write, `init()` and its options, interpolation and ICU, value markers, the catalog, and request scopes. This skill adds only what Svelte changes. Where the binding passes a call to the core unchanged, it names the core file that describes it, as `node_modules/langsys-js-typescript/skill/<file>.md`.

## What Svelte changes

- **`LangsysApp` is the core's singleton.** Every member passes through to the core unchanged, except `init` and `setWriteGrant`, which also accept Svelte stores. `OVERRIDDEN_MEMBERS` lists those two.
- **`t` is a store.** `{$t('Save', 'UI')}` in markup re-renders on every catalog or locale change.
- **`<Translate>`, `<Phrase>` and `<DontTranslate>` are components** over the core's `Translate` and `Phrase` and the `translate="no"` opt-out.
- **Svelte writes `{user.name}` straight into the DOM**, so at runtime nothing separates a variable from the text around it. The build transform, `langsysPreprocess()`, reads the variables from the source instead. **Without it, `<Translate>` and `<Phrase>` render translations but register nothing.** `$t()` registers either way.
- **SvelteKit renders each request in a request scope of its own** through one `handle`, `createLangsysHandle`, and the browser takes the server's catalog before hydrating, with `hydrateFromServer()`.

## The rules that matter most

1. **Add `langsysPreprocess()` last in `svelte.config.js`'s `preprocess`.** It is what lets `<Translate>` and `<Phrase>` register. [transform.md](./transform.md)
2. **Inside `<Translate>` and `<Phrase>`, `{name}` is a Svelte expression.** With the transform it becomes a placeholder with its value as a param. Without it, write `%name%` and pass `params`. Inside a `$t()` string, `{name}` is the placeholder itself. [transform.md](./transform.md)
3. **`UserLocaleStore` is a Svelte `writable`.** Change the locale by setting it. [setup.md](./setup.md)
4. **Initialize in the browser, in `onMount`.** On a SvelteKit server, render through `createLangsysHandle`, never through process-wide state. [sveltekit.md](./sveltekit.md)
5. **`$writeEnabled` is `undefined` during the server render and the hydration pass.** That means not known yet, never `false`. [setup.md](./setup.md)
6. **Never replace the page with a loading state while Langsys starts.** Untranslated text renders as its source, and a server render would serve the loading state as the page. [pitfalls.md](./pitfalls.md)

## Where to read

| Read | When |
|---|---|
| [setup.md](./setup.md) | Installing, `LangsysApp.init()`, the locale store, `$t` and the other stores, `writeEnabled` and write grants |
| [components.md](./components.md) | Writing `$t`, `<Translate>`, `<Phrase>`, `<DontTranslate>`, and server messages with `$serverMessage` |
| [transform.md](./transform.md) | Setting up `langsysPreprocess()`, what it names, and the blocks it can't read |
| [sveltekit.md](./sveltekit.md) | Server rendering: `createLangsysHandle`, `hydrateFromServer()`, `syncNavigation()` |
| [pitfalls.md](./pitfalls.md) | Something registers wrong, or not at all, or renders in the wrong language |

What the binding passes to the core unchanged is described in the core skill:

| Call or option | Core file |
|---|---|
| Every `init()` option except `UserLocaleStore` and `writeGrant` | `node_modules/langsys-js-typescript/skill/init-config.md` |
| `ssrTokenStrategy`, `credentials` and what a server render registers | `node_modules/langsys-js-typescript/skill/server-rendering.md` |
| `writeEnabled`'s meaning, write grants, page reports, `notifyNavigation()` | `node_modules/langsys-js-typescript/skill/writing.md` |
| `legacyKeys`, `LangsysApp.loadSnapshot()` | `node_modules/langsys-js-typescript/skill/migration.md` |
| `LangsysApp.localeHeaders()`, `LangsysApp.detectPreferredLocale()`, `canonicalizeLocale()`, the country, currency and locale lists | `node_modules/langsys-js-typescript/skill/locales.md` |
| `resolveServerMessages()`, `renderServerMessage()`, `messagesCategory`, `LangsysApp.seedCatalog()` | `node_modules/langsys-js-typescript/skill/catalog.md` |
| Placeholders, ICU, plurals and gender in `$t()` | `node_modules/langsys-js-typescript/skill/interpolation.md` |

## Entry points

| Import | Holds |
|---|---|
| `langsys-js-svelte` | `LangsysApp`, the stores (`t`, `currentlyLoadedLocale`, `sTranslations`, `writeEnabled`, `serverMessage`), the components, and the core names and types an app needs |
| `langsys-js-svelte/preprocess` | `langsysPreprocess`, for `svelte.config.js` |
| `langsys-js-svelte/kit` | `syncNavigation` and `hydrateFromServer`, for SvelteKit's browser side |
| `langsys-js-svelte/kit/server` | `createLangsysHandle`, for `src/hooks.server.ts` |

The main entry never imports `$app/*`, so it works in a Svelte app without SvelteKit. Import from `langsys-js-svelte`: it re-exports the core's names an app uses. The project must hold one copy of the core, which [pitfalls.md](./pitfalls.md) explains.
