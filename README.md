# Langsys SDK - Svelte

Langsys revolutionizes localization for apps with easy to integrate, realtime, continuous translations. Read more about Langsys Translation Manager [at the website](https://Langsys.dev/).

Integrate the Langsys Translation Manager into your Svelte applications using this SDK.

[![GitHub Release](https://img.shields.io/github/release/langsys/langsys-js-svelte.svg?style=flat)]()
[![GitHub last commit](https://img.shields.io/github/last-commit/langsys/langsys-js-svelte.svg?style=flat)]()
[![GitHub pull requests](https://img.shields.io/github/issues-pr/langsys/langsys-js-svelte.svg?style=flat)]()
[![PR's Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](http://makeapullrequest.com)
[![NPM License](https://img.shields.io/npm/l/all-contributors.svg?style=flat)](https://github.com/langsys/langsys-js-svelte/blob/master/LICENSE)

## Creating a Langsys project

Visit [Langsys.dev](https://Langsys.dev/) to create your account, and then create your project. Take note your project ID and API key.

From within your Svelte project:

```bash
# install sdk to your svelte project
npm install langsys-js-svelte
```

## Developing

### Initialization
Once you've installed the SDK in your project with `npm install` (or `pnpm install` or `yarn`), you are ready to initialize Langsys, which needs to be done before the rest of your app.

For a plain Svelte app, this might be in your app.svelte component onMount call

```html
<script lang="ts">
    // ...
    import { LangsysApp } from 'langsys-js-svelte';
    import sUserLocale from '../stores/UserLocale'; // wherever your store for your user locale is
    // ...

    let appInitError = false;

    onMount(() => {
        /**
         * Must be called once during app initialization before anything else!
         * @param projectid The ID (UUID) of the project created in Langsys for this app
         * @param key The API key associated to the configured projectid
         * @param UserLocaleStore A svelte-store Writable string with the user-selected locale
         * @param [baseLocale='en-us'] The base language/locale this app uses. ie: what language is put into the code?
         * @param [debug=false] {boolean} Set true to enable console logs (errors and warnings will ignore this setting)
         */
        LangsysApp.init(env.projectid, env.apikey, sUserLocale, 'en-us').then((response) => {
            if (response.status) {
                appInit();
            } else {
                appInitError = {
                    code: 'LS-PK404',
                    details: null,
                    message: `Could not find matching project and key.`,
                    hint: `${config.langsys.projectid} | ${config.langsys.key.substring(0, 10)}{...}`,
                };
            }
        });
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
Content that needs to be translated, we call "tokens". By simply adding it to your app, then running your app, a token will automatically be created in your Translation Manager if it does not yet exist. This will only happen if you have enabled `write` permissions on your API key.  `Write` allows automatic inserts of new tokens, nothing else, and can be toggled off at any time. It is highly recommended to use an API key with `write` permission on your development app, but switch to a read-only key for your production app.

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
    import { LangsysApp, type iCountryList, type iCountryDialCode, type iLocaleDefault } from 'langsys-js-svelte';

    let countries: iCountryList;
    let dialCodes: iCountryDialCode[];
    let locales: iLocaleDefault;
    let singleLanguageName:string;
    onMount( async () => {
        countries = await LangsysApp.getCountries();
        dialCodes = await LangsysApp.getDialCodes();
        locales = await LangsysApp.getLocales();
        singleLanguageName = await LangsysApp.getLanguageName('es-es', true, 'fr-fr'); // espagnol
    });
</script>
```
