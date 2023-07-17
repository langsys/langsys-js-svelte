# Langsys SDK - Svelte

Langsys revolutionizes localization for apps with easy to integrate, realtime, continuous translations. Read more about Langsys Translation Manager [at the website](https://Langsys.dev/).

Integrate the Langsys Translation Manager into your Svelte ***(not SvelteKit)*** applications using this SDK.

[![GitHub Release](https://img.shields.io/github/release/langsys/langsys-js-svelte.svg?style=flat)]()
[![GitHub last commit](https://img.shields.io/github/last-commit/langsys/langsys-js-svelte.svg?style=flat)]()
[![GitHub pull requests](https://img.shields.io/github/issues-pr/cdnjs/cdnjs.svg?style=flat)]()
[![PR's Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](http://makeapullrequest.com)
[![NPM Version](https://img.shields.io/npm/v/npm.svg?style=flat)]()
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
         * @param projectid The ID of the project created in Langsys for this app
         * @param key The API key associated to the configured projectid
         * @param UserLocaleStore A svelte-store Writable string with the user-selected locale
         * @param [baseLocale='en'] The base language/locale this app uses. ie: what language is put into the code?
         * @param [debug=false] {boolean} Set true to enable console messages
         */
        LangsysApp.init(env.projectid, env.apikey, sUserLocale, 'en').then((response) => {
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

To implement Langsys throughout your app, anywhere you have content to display to the end user, you wrap it in the translation store.

```js
$_['Title for my page here']
```

Thats it! This lets you keep natural language inside your app where it belongs, while automatically building a database of translations that completed in the Langsys Translation Manager.

A more complete example:

```html
<script type="ts">
    import { _ } from 'langsys-js-svelte';
</script>
<h1>{$_['Hello World!']}</h1>
<!-- And to separate some content with context, lets categorize it! -->
<MainMenu>
    <Button>{$_['{[Menu]} Home']}</Button>
    <Button>{$_['{[Menu]} About']}</Button>
</MainMenu>
```

Categorization of content helps provide translators with context and prevents clobbering of two different translations from the same source text.

> ie:  `Home` on a main menu is often translated differently than `Home` on a page referring to a person's actual home.

Since Langsys reduces translation by following a core principal of "translate only once", the word `Home` would be translated once and automatically filled whenever it is seen. So when you need the same word or phrase translated differently, categorize it to make it unique.

### Creating translation tokens

Content that needs to be translated, we call "tokens". By simply adding it to your app, then running your app, a token will automatically be created in your Translation Manager if it does not yet exist. This will only happen if you have enabled WRITE permissions on your API key.  Write allows automatic inserts of new tokens, nothing else, and can be toggled off at any time.

### Translation - Using the Translation Manager
Your project can have translators assigned, so that when new tokens appear, they are notified and can quickly translate the new content for you, from any device.
