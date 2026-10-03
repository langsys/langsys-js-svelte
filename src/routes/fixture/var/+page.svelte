<script lang="ts">
    /**
     * VAR-6 testbed: this route is compiled WITH the transform (see `varTransform` in vite.config.ts),
     * and `/fixture/var-plain` with the same first block WITHOUT it. Driven by `_dev_/e2e/var.mjs`.
     */
    import { page } from '$app/state';
    import { LangsysApp, Phrase, Translate, currentlyLoadedLocale } from '$lib/index.js';

    const params = page.url.searchParams;
    const user = $state({ name: params.get('user') ?? 'Ana' });
    const items = $state(Array.from({ length: Number(params.get('n') ?? 3) }, (_, i) => i));
    // Raw HTML, as a CMS field arrives: content, not a variable.
    const cms = '<p>From the CMS, section one</p>';
    const cmsMixed = '<p>Mixed CMS text</p>';
    // A placeholder that resolves: the build declines to capture an {#await} (a fallback).
    // `?await=<ms>` sets how long it takes, to resolve inside or outside the core's settle window.
    const later = new Promise<string>((resolve) => setTimeout(() => resolve('Loaded after a moment'), Number(params.get('await') ?? 1500)));
    // The core's header for the app's own API calls, read again whenever the loaded locale changes.
    const acceptLanguage = $derived($currentlyLoadedLocale ? (LangsysApp.localeHeaders()['Accept-Language'] ?? '(none)') : '(no locale yet)');
</script>

<Translate category="VAR" tag="div"><p id="greet">Hello {user.name}, welcome back</p></Translate>
<Translate category="VAR" tag="div"
    ><p id="cart">You have {items.length} items</p>
    <button id="add" onclick={() => items.push(items.length)}>Add one</button></Translate
>
<Phrase category="VAR" tag="p">Signed in as <b id="who">{user.name}</b></Phrase>
<Translate category="VAR" tag="div"
    ><ul id="list">
        {#each items as i (i)}<li>Item {i}</li>{/each}
    </ul></Translate
>
<Translate category="VAR" tag="div"><div id="cms">{@html cms}</div></Translate>
<Translate category="VAR" tag="div"
    ><p id="mixed">Hi {user.name}</p>
    {@html cmsMixed}</Translate
>
<Translate category="VAR" tag="div"><p id="awaiting">{#await later}Loading…{:then text}{text}{/await}</p></Translate>
<p id="locale-headers">Accept-Language: {acceptLanguage}</p>
