<script lang="ts">
    /**
     * Phrase — Svelte 5 wrapper around the vanilla `Phrase` rich-text handler.
     *
     * Use inside (or outside) <Translate> to keep a markup-bearing run as ONE
     * translatable phrase — e.g. so a count variable stays next to the noun it
     * pluralizes:
     *
     *   <Phrase category="ProductCard" params={{ n: reviewCount }}>
     *     Based on %n% <strong>reviews</strong>
     *   </Phrase>
     *
     * Placeholders in markup use `%n%`, not `{n}` — Svelte would compile a bare
     * `{n}` as its own expression tag and substitute it before Langsys saw the
     * text. The value is then baked into the encoded phrase string this
     * component looks up — `Based on 0 {m0o}reviews{m0c}` — so every distinct
     * value becomes its own catalog entry. Note this is NOT <Translate>'s
     * mechanism: <Phrase> keys on the encoded string via a plain phrase
     * lookup, with no content block and no custom_id. The base SDK normalizes
     * `%n%` back to canonical `{n}` at capture, so translators still see `{n}`.
     *
     * The inline markup never reaches the translator — it's replaced with
     * neutral tokens and the real elements are reconstituted at render (see
     * richtext.ts in the base SDK). The host carries `data-ls-phrase` so a
     * wrapping <Translate> skips it and lets this handler own it.
     */
    import { Phrase as VanillaPhrase, type ParamPrimitive } from 'langsys-js-typescript';
    import type { Snippet } from 'svelte';
    import { onDestroy } from 'svelte';

    interface Props {
        class?: string;
        tag?: string;
        category?: string;
        params?: Record<string, ParamPrimitive>;
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
