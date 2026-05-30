# SSR Usage Guide

This guide shows how to use `langsys-js-svelte` with Server-Side Rendering (SSR) to eliminate duplicate API calls and improve performance.

## The problem

In a traditional SSR flow:
1. The server fetches translations during render.
2. The client re-fetches the same translations after hydration.
3. Duplicate API calls, slower initial render, possible flash of untranslated content.

## The solution

Pass pre-fetched translations from server to client using the `initialTranslations` config option. The client SDK uses them as-is and skips the initial fetch.

## SvelteKit implementation

### Step 1: Server-side data fetching

```typescript
// src/routes/+layout.server.ts
import type { iCategories } from 'langsys-js-svelte';

export async function load({ fetch, locals }) {
    const locale = locals.userLocale || 'en';

    const response = await fetch(
        `https://api.langsys.dev/api/projects/${process.env.LANGSYS_PROJECT_ID}/translations?locale=${locale}`,
        {
            headers: {
                'x-Authorization': process.env.LANGSYS_API_KEY,
                'Content-Type': 'application/json',
            },
        },
    );
    const result = await response.json();

    return {
        locale,
        translations: result.data as iCategories,
        projectId: process.env.LANGSYS_PROJECT_ID,
        apiKey: process.env.PUBLIC_LANGSYS_API_KEY, // use a read-only key for the client
    };
}
```

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

    onMount(async () => {
        const config: iLangsysInitConfig = {
            projectid: data.projectId,
            key: data.apiKey,
            UserLocaleStore: userLocale,
            baseLocale: 'en',
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

<h1>{$t('Welcome', 'HomePage')}</h1>
<p>{$t('Description', 'HomePage')}</p>
<p>{$t('Hello, {name}!', 'HomePage', { name: 'Sarah' })}</p>
```

## Locale switching

Update the `userLocale` writable; the SDK reacts and fetches the new locale's translations:

```svelte
<script lang="ts">
    import { LangsysApp } from 'langsys-js-svelte';
    import { writable } from 'svelte/store';

    // (assume userLocale was created at the layout level and is in scope)
    function changeLocale(newLocale: string) {
        $userLocale = newLocale;       // subscribers in the SDK trigger a fetch
        // Optional: explicitly await the in-flight fetch:
        return LangsysApp.translationsLoadingPromise;
    }
</script>

<button onclick={() => changeLocale('es')}>Español</button>
<button onclick={() => changeLocale('fr')}>Français</button>
```

## Plain Node.js SSR

For non-SvelteKit SSR implementations:

```javascript
// server.js
import { render } from 'svelte/server';
import App from './App.svelte';

const translations = await fetch(/* ... */).then((r) => r.json());

const { html, head } = render(App, {
    props: { initialTranslations: translations, locale: 'en' },
});

res.send(`
<!DOCTYPE html>
<html>
<head>${head}</head>
<body>
    ${html}
    <script>
        window.__INITIAL_TRANSLATIONS__ = ${JSON.stringify(translations)};
        window.__INITIAL_LOCALE__ = 'en';
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
- Translations ready immediately on hydration.
- Faster Time to Interactive (TTI).
- Reduced API usage and costs.

### User experience
- No flash of untranslated content.
- Instant translation display.
- Better SEO with server-rendered translations.

### Developer experience
- Simple configuration.
- Full TypeScript support, including compile-time-checked interpolation params on `$t()`.

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

## Important notes

1. **One-time use.** `initialTranslations` is consumed only at init. Locale changes after init go through the normal fetch path.
2. **Matching locales.** Always provide `initialTranslationsLocale` with `initialTranslations` so the SDK knows what locale the data represents.
3. **Data format.** The translations payload must match the `iCategories` shape returned by `LangsysAppAPI.getTranslations()`.
4. **Cache.** The 60-second locale cache still applies. Pre-fetched translations count as cached.
5. **Token creation.** Use a read-only API key for the client in production — missing tokens won't be sent. Keep the write key on the server (and ideally pre-populate tokens via your local dev environment).

## Troubleshooting

### Translations not appearing
- Check that `initialTranslationsLocale` matches the `UserLocaleStore` value at init.
- Verify the translations payload matches the `iCategories` shape.
- Enable `debug: true` and look for the messages above.

### Still seeing duplicate API calls
- Confirm both `initialTranslations` *and* `initialTranslationsLocale` are passed.
- Confirm init runs before any rendering that calls `$t(...)`.
- Confirm the locale hasn't drifted between server and client.

### TypeScript errors on `$t()`
- Placeholders are compile-time-checked: `$t('Hello, {name}!', 'Cat')` *requires* a params object with `name`. Either add the key or remove the placeholder.
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

If you're migrating from `langsys-js-svelte` v2.x, the SSR plumbing is unchanged — `initialTranslations` / `initialTranslationsLocale` work exactly as before. The only call-site difference is template usage:

```svelte
<!-- v2.x -->
<h1>{$_['HomePage']['Welcome']}</h1>

<!-- v3.0+ -->
<h1>{$t('Welcome', 'HomePage')}</h1>
```

See `CHANGELOG.md` for the full breaking-change list.
