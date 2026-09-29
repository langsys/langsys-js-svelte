<script lang="ts">
    /**
     * Fixture for `var-served.test.ts`, compiled WITH the transform (see `varTransform` in
     * vite.config.ts). Seeds the catalog in the component body, as README-SSR.md's pattern does.
     */
    import { DontTranslate, Phrase, Translate, currentlyLoadedLocale, sTranslations } from '$lib/index.js';
    import type { iCategories } from 'langsys-js-typescript';

    const props: { catalog: iCategories; locale: string; name: string; count: number; vip: boolean } = $props();
    // svelte-ignore state_referenced_locally
    sTranslations.set(props.catalog);
    // svelte-ignore state_referenced_locally
    currentlyLoadedLocale.set(props.locale);
</script>

<Translate category="VAR" tag="div"><p id="greet">Hello {props.name}, welcome back</p></Translate>
<Translate category="VAR" tag="div"><p id="cart">You have {props.count} items</p></Translate>
<Translate category="VAR" tag="div"><p id="branch">{#if props.vip}Welcome, VIP{:else}Welcome{/if}</p></Translate>
<Phrase category="VAR" tag="p">Signed in as <b>{props.name}</b></Phrase>
<Translate category="VAR" tag="div"><p id="sku">Code <DontTranslate tag="code">{props.name}</DontTranslate></p></Translate>
<Translate category="VAR" tag="div"><ul id="each">{#each [1, 2] as i (i)}<li>Item {i}</li>{/each}</ul></Translate>
