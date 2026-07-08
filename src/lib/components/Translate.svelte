<script lang="ts">
    /**
     * Translate — Svelte 5 wrapper around the vanilla `Translate` DOM class
     * from langsys-js-typescript. Mounts the class on the rendered host element, lets it
     * walk and tokenize the children (including translatable attributes), and
     * tears it down on destroy. The actual translation lifecycle —
     * single-token vs content-block, re-translation on locale change, missing
     * token registration — lives in the base SDK; this component is purely
     * the mount/destroy glue.
     */
    import { Translate as VanillaTranslate, type ParamPrimitive } from 'langsys-js-typescript';
    import type { Snippet } from 'svelte';
    import { onDestroy } from 'svelte';

    interface Props {
        class?: string;
        tag?: string;
        label?: string;
        category?: string;
        custom_id?: string;
        params?: Record<string, ParamPrimitive>;
        children: Snippet;
    }

    let {
        class: clazz = '',
        tag = 'translate',
        label = '',
        category = '',
        custom_id = '',
        params = undefined,
        children,
    }: Props = $props();

    let host = $state<HTMLElement>();
    let instance: VanillaTranslate | undefined;

    $effect(() => {
        if (!host || instance) return;
        instance = new VanillaTranslate(host, { category, custom_id, label, params });
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

<svelte:element this={tag} class={clazz} bind:this={host}>
    {@render children?.()}
</svelte:element>
