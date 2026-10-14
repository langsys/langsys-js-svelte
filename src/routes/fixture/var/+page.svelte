<script lang="ts">
    /**
     * VAR-6 testbed: this route is compiled WITH the transform (see `varTransform` in vite.config.ts),
     * and `/fixture/var-plain` with the same first block WITHOUT it. Driven by `_dev_/e2e/var.mjs`.
     */
    import { onMount } from 'svelte';
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
    // Rendered only in the browser: what the client registers on its own (the control for "the
    // client does not resend what the server collected"), and a block of two sentences, mounted
    // before the layout's init(), whose registered content the browser sends.
    let mounted = $state(false);
    onMount(() => (mounted = true));
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
<!-- eslint-disable-next-line svelte/no-at-html-tags -- constant markup written in this file -->
<Translate category="VAR" tag="div"><div id="cms">{@html cms}</div></Translate>
<Translate category="VAR" tag="div"
    ><p id="mixed">Hi {user.name}</p>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- constant markup written in this file -->
    {@html cmsMixed}</Translate
>
<Translate category="VAR" tag="div"><p id="awaiting">{#await later}Loading…{:then text}{text}{/await}</p></Translate>
<!-- A readable block inside a fallback block (the {#each}): a block of its own, rendered by the binding. -->
<Translate category="VAR" tag="div"
    >{#each items.slice(0, 1) as i (i)}<span>Gallery</span>{/each}
    <Translate category="VAR" tag="div"><img id="photo" alt="Photo of {user.name}" src="data:," /></Translate></Translate
>
<p id="locale-headers">Accept-Language: {acceptLanguage}</p>
{#if mounted}
    <Translate category="VAR" tag="div"><p id="client-only">Rendered in the browser for {user.name}</p></Translate>
    <Translate category="VAR" tag="div"
        ><p id="client-block">Shown in the browser to {user.name}</p>
        <p>Mounted before init</p></Translate
    >
{/if}
