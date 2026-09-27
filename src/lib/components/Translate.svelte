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
    import { CONTENT_BLOCK_MARKER_ATTR, Translate as VanillaTranslate, warnUnrenderedBlock, type ParamPrimitive } from 'langsys-js-typescript';
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

    let { class: clazz = '', tag = 'translate', label = '', category = '', custom_id = '', params = undefined, children }: Props = $props();

    /**
     * MARK-1 on the server. The block's id is normally derived by the core's tokenizer, which needs
     * a DOM and so runs only in the browser. When the app supplies `custom_id` the id is already
     * known, so the host carries it from the first render — in the served HTML too — under the
     * core's own attribute name. With no `custom_id` nothing is stamped here: the core stamps the
     * derived id when it mounts.
     */
    const stamp = $derived(custom_id ? { [CONTENT_BLOCK_MARKER_ATTR]: custom_id } : {});

    /**
     * SRV-1's sanctioned fallback, reported. On the server this component holds its children only
     * as a render function, and the core's block renderer takes a node tree, not the HTML a render
     * function produces; so the block is served as source and translated after mount. The core
     * reports that once per process per reason.
     */
    if (typeof window === 'undefined') warnUnrenderedBlock('string-path-deferred');

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

<svelte:element this={tag} {...stamp} class={clazz} bind:this={host}>
    {@render children?.()}
</svelte:element>
