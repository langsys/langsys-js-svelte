<script lang="ts">
    /**
     * Phrase — Svelte 5 wrapper around the vanilla `Phrase` rich-text handler.
     *
     * Use inside (or outside) <Translate> to keep a markup-bearing run as ONE
     * translatable phrase — e.g. so a count variable stays next to the noun it
     * pluralizes:
     *
     *   <Phrase category="ProductCard" params={{ n: reviewCount }}>
     *     Based on {n} <strong>reviews</strong>
     *   </Phrase>
     *
     * The inline markup never reaches the translator — it's replaced with
     * neutral tokens and the real elements are reconstituted at render (see
     * richtext.ts in the base SDK). The host carries `data-ls-phrase` so a
     * wrapping <Translate> skips it and lets this handler own it.
     */
    import { Phrase as VanillaPhrase } from 'langsys-js-typescript';
    import type { Snippet } from 'svelte';
    import { onDestroy } from 'svelte';

    interface Props {
        class?: string;
        tag?: string;
        category?: string;
        params?: Record<string, unknown>;
        children: Snippet;
    }

    let {
        class: clazz = '',
        tag = 'span',
        category = '',
        params = {},
        children,
    }: Props = $props();

    let host = $state<HTMLElement>();
    let instance: VanillaPhrase | undefined;

    $effect(() => {
        if (!host || instance) return;
        instance = new VanillaPhrase(host, { category, params });
    });

    // Re-render when params change (e.g. a changed count) after mount.
    $effect(() => {
        const next = params;
        if (instance) instance.setParams(next);
    });

    onDestroy(() => {
        instance?.destroy();
        instance = undefined;
    });
</script>

<svelte:element this={tag} data-ls-phrase="" class={clazz} bind:this={host}>
    {@render children?.()}
</svelte:element>
