# Langsys SDK - Svelte

Langsys revolutionizes localization for apps with easy to integrate, realtime, continuous translations. Read more about Langsys Translation Manager [at the website](https://Langsys.dev/).

Integrate the Langsys Translation Manager into your Svelte and SvelteKit applications using this SDK.

## Requirements

- **Svelte 5** - This SDK requires Svelte 5 and is fully compatible with SSR (Server-Side Rendering) in SvelteKit applications.

> **Note for Svelte 3/4 users:** The last version supporting Svelte 3 and 4 (client-side only) is available at tag `v-last-svelte4-compat`. Use that version if you need compatibility with older Svelte versions.

[![GitHub Release](https://img.shields.io/github/release/langsys/langsys-js-svelte.svg?style=flat)]()
[![GitHub last commit](https://img.shields.io/github/last-commit/langsys/langsys-js-svelte.svg?style=flat)]()
[![GitHub pull requests](https://img.shields.io/github/issues-pr/langsys/langsys-js-svelte.svg?style=flat)]()
[![PR's Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](http://makeapullrequest.com)
[![NPM License](https://img.shields.io/npm/l/all-contributors.svg?style=flat)](https://github.com/langsys/langsys-js-svelte/blob/master/LICENSE)

## Creating a Langsys project

Visit [Langsys.dev](https://Langsys.dev/) to create your account, and then create your project. Take note your project ID and API key.

### API Key Permissions

The SDK now automatically detects and respects API key permissions:

- **Write Permission**: Allows automatic creation of new translation tokens and content blocks. Recommended for development environments.
- **Read-only Permission**: Only fetches existing translations. Recommended for production environments to prevent accidental token creation.

The SDK will automatically skip token collection and content block creation when using a read-only key.

From within your Svelte project:

```bash
# install sdk to your svelte project
npm install langsys-js-svelte
```

## Developing

### Initialization
Once you've installed the SDK in your project with `npm install` (or `pnpm install` or `yarn`), you are ready to initialize Langsys, which needs to be done before the rest of your app.

#### Modern Configuration (Recommended)

```typescript
import { LangsysApp, type iLangsysInitConfig } from 'langsys-js-svelte';
import sUserLocale from './stores/UserLocale';

const config: iLangsysInitConfig = {
    projectid: env.LANGSYS_PROJECT_ID,
    key: env.LANGSYS_API_KEY,
    UserLocaleStore: sUserLocale,
    baseLocale: 'en-us',
    debug: false,
    ssrTokenStrategy: 'client' // Optional: 'client' | 'server' | 'auto'
};

await LangsysApp.init(config);
```

#### Legacy Initialization (Deprecated)

> ⚠️ **DEPRECATED**: The parameter-based approach is deprecated and will be removed in a future version. Please migrate to the config object approach above.

```typescript
// ⚠️ DEPRECATED - DO NOT USE FOR NEW CODE
await LangsysApp.init(
    projectid,
    apikey,
    sUserLocale,
    'en-us',
    false, // debug
    false  // emulateFailureToLoad
);
```

#### SSR Token Strategy

**Available strategies for `ssrTokenStrategy`:**
- `'client'` (default): Tokens discovered during SSR are queued and sent from the client after hydration. Best for performance.
- `'server'`: Tokens are sent immediately from the server during SSR. Best for reliability and immediate registration.
- `'auto'`: Small batches (≤5 tokens) sent from server, larger batches queued for client. Balanced approach.

### Server-Side Rendering (SSR) Support

This SDK fully supports SSR with SvelteKit and other SSR frameworks. Key features include:

- **Eliminate duplicate API calls** by passing pre-fetched translations from server to client
- **Faster initial render** with translations ready immediately on hydration
- **Better SEO** with server-rendered translated content
- **Configurable token strategies** for different SSR environments

📖 **For detailed SSR implementation guide, see [README-SSR.md](./README-SSR.md)**

The SSR guide includes:
- Complete SvelteKit implementation example
- How to pass translations from server to client
- Plain Node.js SSR setup
- Configuration options and best practices
- Troubleshooting common SSR issues

For a plain Svelte app, this might be in your app.svelte component onMount call

```html
<script lang="ts">
    // ...
    import { LangsysApp, type iLangsysInitConfig } from 'langsys-js-svelte';
    import sUserLocale from '../stores/UserLocale'; // wherever your store for your user locale is
    // ...

    let appInitError = false;

    onMount(async () => {
        const config: iLangsysInitConfig = {
            projectid: env.LANGSYS_PROJECT_ID,
            key: env.LANGSYS_API_KEY,
            UserLocaleStore: sUserLocale,
            baseLocale: 'en-us',
            debug: false,
            ssrTokenStrategy: 'client' // Optional for SSR apps
        };

        const response = await LangsysApp.init(config);

        if (response.status) {
            appInit();
        } else {
            appInitError = {
                code: 'LS-PK404',
                details: null,
                message: `Could not find matching project and key.`,
                hint: `${config.projectid} | ${config.key.substring(0, 10)}{...}`,
            };
        }
    });

    function appInit() {
        // ... rest of your app initialization functions
    }
</script>

<App {...params}>
    <!-- If Langsys (or something else you might have) doesn't complete, it fills out the appInitError and this displays, example code styled by Bulma classes -->
    {#if appInitError !== false}
        <View>
            <Page class="p-6">
                <img
                    src={config.brand.logoTall}
                    class="mb-4 mx-auto is-block"
                    style="width: 500px; max-width: 100%"
                    alt={config.brand.name}
                />
                <Card style="margin: auto auto; max-width: 400px;">
                    <CardContent>
                        {#if appInitError === false}
                            <Loader />
                        {:else}
                            <div class="is-notification is-danger is-light">
                                <h5 class="mt-0 has-text-dark">Error during app init</h5>
                                <p class="has-text-weight-bold">[{appInitError.code}] {appInitError.message}</p>
                                <p class="is-italic has-text-dark">{appInitError.hint}</p>
                            </div>
                        {/if}
                    </CardContent>
                </Card>
            </Page>
        </View>
    {:else}
        <View>
            <!-- ... your normal application view after initialization succeeds ... -->
        </View>
    {/if}
</App>
```
![image of integration code error](https://p-gkfqz2n.b2.n0.cdn.getcloudapp.com/items/9ZuymoAe/c1b84ac3-f07c-4539-bd84-24467d53caf6.jpg?source=viewer&v=214198bfd9215c42c09ad0427465f4fa)

### Implementation

There are two ways to implement translations in-app.
1. Direct store for individual strings
2. Translate component for individual strings, paragraphs or any html content you want translated in whole.

#### Direct Store
This is the most common method you will use throughout your app.
```html
<script lang="ts">
    import { _ } from "langsys-js-svelte";
</script>
<h1>{$_['Context Category']['Title for my page here']}</h1>
```
The underscore `_` is the store. The first array entry is to help you organize and give context to your content. The second is your actual content to be translated.  While we highly recommend using categorization, it is not required.  You can also do this:
```js
$_['Title for my page here']
```
It is important to note that every translation is unique to its category.  An example:
```js
$_['Main Menu']['Home']; // translated to 'Inicio' in spanish
$_['Home repairs page']['Home']; // translate to 'Hogar' in spanish
```
As you see you'll need two different translations for the word `Home`. If you didn't categorize, you'd only be able to have ONE translation, which wouldn't work in this context.

Langsys will always minimize translations with the philosophy of translate ONCE, use everywhere.  So when you need contextual translations, you'll need to categorize them.

A good rule for organization is to categorize based on the module the content is being displayed. ie: `Home`, `Main Menu`, `Account`, `Errors`, or even `UI` for reusable content like `Ok` `Yes` `Submit` etc.

#### Translate Component
This component is geared toward larger blocks of content without variable data. An example of this would be web page content or a blog article, but it can be any html content you like, or it can even just be a string of text too.

##### Some Examples:
```html
<script type="ts">
import { Translate } from "langsys-js-svelte";
</script>
<Translate category="Blog" tag="div">
    <h1 class="title">My article title</h1>
    <p>My content <strong>is the best</strong> when internationalized by Langsys.</p>
    <p>Because this contains html, Langsys will create a "content block" from it.</p>
    <p>
        That means in the Translation Manager, the translator will see this content in the same
        way that end-users see it in your app.  All styling from classes or otherwise is retained.
        The translator would visually translate the content, while having no control over the styling.
        For example, the would translate the phrase "My content" and then "is the best" in two separate
        phrases, but because they see the same bolding and sentence structure, they can apply the right
        words in sequence.
    </p>
    <p>
        This is a key feature of Langsys! Separating design from content entirely and yet making it super
        easy to translate!
    </p>
</Translate>

<Translate category="Home">
    Maybe I have a paragraph of text without html formatting, but I want it to be line wrapped
    and looking pretty in my code. I could use {$_['Home']['This content']} but since its so long
    it wouldn't look nice in my code.  Translate will recognize this is without HTML and treat it
    as a single string instead of a content block.  It will trim out extra spaces (line breaks) so that
    translation is clean, but it will also preserve my spaces when redisplayed to the end-users.
</Translate>

<!-- Yes, you can even pass your CMS content directly into the Translate component!  No more managing translations externally! -->
<Translate category="News" tag="div">
    {@html article?.content}
</Translate>
```

Thats it! This lets you keep natural language inside your app where it belongs, while automatically building your database of translations!

### Content Blocks
In using the Translate Component, you will automatically generate what we call `Content Blocks` in the Translation Manager app.
![Translation Manager Content Block UI](https://p-GKFQz2n.b2.n0.cdn.zight.com/items/z8uo8Gq8/3c5ec3fd-253b-42db-8b33-da9b60aa84ec.png?v=25bd11b616dafeb31c15ae6e72613689)

### Creating translation tokens
Content that needs to be translated, we call "tokens". By simply adding it to your app, then running your app, a token will automatically be created in your Translation Manager if it does not yet exist.

**Important:** Token creation only occurs when using an API key with `write` permissions. The SDK automatically detects your key's permission level and will:
- With write permission: Automatically create new tokens and content blocks as they're discovered
- With read-only permission: Only fetch existing translations, skip all token creation

It is highly recommended to use an API key with `write` permission on your development app, but switch to a read-only key for your production app.

### Translation - Using the Translation Manager
Your project can have translators assigned, so that when new tokens appear, they are notified and can quickly translate the new content for you, from any device.  You can also enable automatic machine translations or even AI translations.  All automatic translations are held as a special status in the Translation Manager, so if you want to have humans pass over and do editing/verifying, they'll know what new content needs done at all times automatically!

### Translations Loading Promise
Sometimes you'll want to re-render some content after translations have been loaded. For example, if some UI is generated with some functions, you'll want to wait for translations to load before calling those functions. This is something to consider, primarily, when a user changes their locale (sUserLocale) after your app is loaded.

You can use the `translationsLoadingPromise` property of the LangsysApp class to wait for translations to load before re-rendering.
```html
<script lang="ts">
    import { LangsysApp } from 'langsys-js-svelte';
    // ...
    $effect(() => {
        LangsysApp.translationsLoadingPromise.then(() => {
            // re-render content here
        });
    });
</script>
```

### Useful Utilities!
In the course of your project you will often need localized country lists, country names, dial codes, and language names.  Generate them easily!
```html
<script lang="ts">
    import { onMount } from 'svelte';
    import { LangsysApp, type iCountryList, type iCountryDialCode, type iCurrencyList, type iLocaleDefault } from 'langsys-js-svelte';

    let countries: iCountryList;
    let dialCodes: iCountryDialCode[];
    let currencies: iCurrencyList;
    let locales: iLocaleDefault;
    let singleLanguageName:string;
    onMount( async () => {
        countries = await LangsysApp.getCountries();      // [{ code: "US", label: "United States" }, ...]
        dialCodes = await LangsysApp.getDialCodes();      // [{ country_code: "US", dial_code: "+1", name: "United States" }, ...]
        currencies = await LangsysApp.getCurrencies();    // [{ code: "USD", name: "US Dollar", symbol: "$", ... }, ...]
        locales = await LangsysApp.getLocales();          // { "English": [{ code: "en-US", name: "English (US)" }, ...], ... }
        singleLanguageName = await LangsysApp.getLanguageName('es-es', true, 'fr-fr'); // espagnol
    });
</script>
```

#### Detecting User's Preferred Locale
Detect the end-user's preferred locale from the browser or SSR request headers:

```typescript
// Browser: uses navigator.languages (full preference array) with fallback to navigator.language
const locale = LangsysApp.detectPreferredLocale();
// Returns: 'en-US', 'fr', etc. or false if not detected

// SSR (SvelteKit hooks.server.ts or +page.server.ts):
const locale = LangsysApp.detectPreferredLocale(request.headers.get('Accept-Language'));
// Parses "en-US,en;q=0.9,fr;q=0.8" and returns highest priority: 'en-US'
```

**Matching against supported locales:** Pass an optional array of supported locale codes to find the best match:

```typescript
// Get your app's supported locales and find the best match
const supportedLocales = (await LangsysApp.getLocalesFlat()).map(l => l.code);
const locale = LangsysApp.detectPreferredLocale(
    request.headers.get('Accept-Language'),
    supportedLocales
);
// If user prefers 'en-US' but you only support 'en-GB', it matches via language code 'en'
```

This is useful for setting an initial locale before the user makes a selection:

```typescript
// In your +layout.server.ts
export const load = async ({ request }) => {
    const supportedLocales = (await LangsysApp.getLocalesFlat()).map(l => l.code);
    const detectedLocale = LangsysApp.detectPreferredLocale(
        request.headers.get('Accept-Language'),
        supportedLocales
    );
    return {
        initialLocale: detectedLocale || 'en' // fallback to 'en' if not detected
    };
};
```
