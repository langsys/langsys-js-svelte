# SSR Usage Guide

This guide shows how to use langsys-js-svelte with Server-Side Rendering (SSR) to eliminate duplicate API calls and improve performance.

## The Problem

In traditional SSR applications:
1. Server fetches translations during render
2. Client re-fetches the same translations after hydration
3. This causes duplicate API calls and slower initial render

## The Solution

Pass pre-fetched translations from server to client using the `initialTranslations` config option.

## SvelteKit Implementation

### Step 1: Server-Side Data Fetching

Create a server load function that fetches translations:

```typescript
// src/routes/+layout.server.ts
import type { iCategories } from 'langsys-js-svelte';

export async function load({ fetch, locals }) {
    // Get user's locale (from cookies, headers, etc.)
    const locale = locals.userLocale || 'en';

    // Fetch translations on the server
    const response = await fetch(
        `https://api.langsys.dev/api/projects/${process.env.LANGSYS_PROJECT_ID}/translations?locale=${locale}`,
        {
            headers: {
                'x-Authorization': process.env.LANGSYS_API_KEY,
                'Content-Type': 'application/json'
            }
        }
    );

    const result = await response.json();

    return {
        locale,
        translations: result.data as iCategories,
        projectId: process.env.LANGSYS_PROJECT_ID,
        apiKey: process.env.PUBLIC_LANGSYS_API_KEY // Use read-only key for client
    };
}
```

### Step 2: Client-Side Initialization

Use the pre-fetched translations in your layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
    import { LangsysApp, type iLangsysInitConfig } from 'langsys-js-svelte';
    import { writable } from 'svelte/store';
    import { onMount } from 'svelte';
    import type { PageData } from './$types';

    export let data: PageData;

    // Create a store for the user's locale
    const userLocale = writable(data.locale);

    onMount(async () => {
        // Initialize with pre-fetched translations
        const config: iLangsysInitConfig = {
            projectid: data.projectId,
            key: data.apiKey,
            UserLocaleStore: userLocale,
            baseLocale: 'en',
            initialTranslations: data.translations,
            initialTranslationsLocale: data.locale,
            ssrTokenStrategy: 'client' // Optional: control token creation
        };

        await LangsysApp.init(config);
    });
</script>

<slot />
```

### Step 3: Using Translations

Use translations as normal in your components:

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
    import { _ } from 'langsys-js-svelte';
</script>

<h1>{$_['HomePage']['Welcome']}</h1>
<p>{$_['HomePage']['Description']}</p>
```

## Advanced: Locale Switching

When users change their locale, the SDK will fetch new translations:

```svelte
<script lang="ts">
    import { LangsysApp } from 'langsys-js-svelte';

    async function changeLocale(newLocale: string) {
        // Update the store (triggers automatic fetch)
        $userLocale = newLocale;

        // Optional: Force immediate fetch
        await LangsysApp.getApp().changeLocale(newLocale, true);
    }
</script>

<button on:click={() => changeLocale('es')}>Español</button>
<button on:click={() => changeLocale('fr')}>Français</button>
```

## Plain Node.js SSR

For non-SvelteKit SSR implementations:

```javascript
// server.js
import { renderToString } from 'svelte/server';
import App from './App.svelte';

// Fetch translations on server
const translations = await fetch(/* ... */);

// Pass to your app
const html = renderToString(App, {
    props: {
        initialTranslations: translations,
        locale: 'en'
    }
});

// Include in your HTML response
res.send(`
<!DOCTYPE html>
<html>
<head>...</head>
<body>
    ${html}
    <script>
        window.__INITIAL_TRANSLATIONS__ = ${JSON.stringify(translations)};
        window.__INITIAL_LOCALE__ = '${locale}';
    </script>
    <script src="/app.js"></script>
</body>
</html>
`);
```

```javascript
// client.js
import { LangsysApp } from 'langsys-js-svelte';

// Use server-provided translations
LangsysApp.init({
    projectid: 'your-project-id',
    key: 'your-api-key',
    UserLocaleStore: userLocale,
    initialTranslations: window.__INITIAL_TRANSLATIONS__,
    initialTranslationsLocale: window.__INITIAL_LOCALE__
});
```

## Benefits

### Performance
- ✅ No duplicate API calls (server + client)
- ✅ Translations ready immediately on hydration
- ✅ Faster Time to Interactive (TTI)
- ✅ Reduced API usage and costs

### User Experience
- ✅ No flash of untranslated content
- ✅ Instant translation display
- ✅ Better SEO with server-rendered translations

### Developer Experience
- ✅ Simple configuration
- ✅ Works with existing code
- ✅ Full TypeScript support
- ✅ Backward compatible

## Configuration Options

### SSR Token Strategy

Control how missing tokens are handled during SSR:

```typescript
{
    ssrTokenStrategy: 'client' | 'server' | 'auto'
}
```

- `'client'` (default): Queue tokens, send from client after hydration
- `'server'`: Send tokens immediately from server
- `'auto'`: Small batches from server, large batches from client

### Debug Mode

Enable debug logging to see when translations are loaded:

```typescript
{
    debug: true,
    initialTranslations: data.translations,
    initialTranslationsLocale: data.locale
}
```

Debug output will show:
- "INITIAL TRANSLATIONS PROVIDED" - When pre-fetched data is detected
- "Using pre-fetched translations for locale" - When skipping API fetch
- "Locale change detected!" - When fetching new translations

## Important Notes

1. **One-time Use**: Initial translations are only used once during initialization. Subsequent locale changes will fetch from the API.

2. **Matching Locales**: Always provide `initialTranslationsLocale` with `initialTranslations` to ensure the data matches the expected locale.

3. **Data Format**: The translations must match the API response structure (iCategories type).

4. **Caching**: The 60-second cache still applies. Pre-fetched translations are marked as cached.

5. **Token Creation**: With read-only API keys, missing tokens won't be created (recommended for production).

## Troubleshooting

### Translations not appearing
- Check that `initialTranslationsLocale` matches the UserLocaleStore value
- Verify the translations data structure matches iCategories type
- Enable debug mode to see what's happening

### Still seeing duplicate API calls
- Ensure you're passing both `initialTranslations` AND `initialTranslationsLocale`
- Check that initialization happens before any translation usage
- Verify the locale hasn't changed between server and client

### TypeScript errors
- Import types: `import type { iCategories } from 'langsys-js-svelte'`
- Ensure you're using the latest version of the SDK

## Example Project Structure

```
src/
├── routes/
│   ├── +layout.server.ts   # Fetch translations
│   ├── +layout.svelte       # Initialize Langsys
│   └── +page.svelte         # Use translations
├── lib/
│   └── stores/
│       └── locale.ts        # User locale store
└── app.html
```

## Migration from Non-SSR

If you're migrating from a client-only setup:

1. **No changes required** - Existing code continues to work
2. **Optional enhancement** - Add server-side fetching when ready
3. **Gradual adoption** - Can implement page by page

The SDK maintains full backward compatibility, so you can adopt SSR support at your own pace.