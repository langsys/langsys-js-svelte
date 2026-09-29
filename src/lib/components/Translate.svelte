<script lang="ts">
    /**
     * Translate — a content block.
     *
     * With `langsysPreprocess()` (from `langsys-js-svelte/preprocess`) in svelte.config.js, the build
     * hands this component its content as a node tree, every interpolation a named placeholder
     * (VAR-6). The block is then rendered through the core's `renderBlock` — on the server as in the
     * browser, so served HTML is already translated and stamped with the block's id — and
     * registered once as `Hello {name}` with the value as a param, never as `Hello Ana`.
     *
     * Without the transform, or for a block it could not read (an `{#each}`, a component), the
     * vanilla `Translate` class from langsys-js-typescript translates the rendered DOM after mount
     * and registers nothing (VAR-7): Svelte writes a variable straight into the DOM, and nothing
     * at runtime can tell it from the text around it. One debug notice says so.
     */
    import {
        CONTENT_BLOCK_MARKER_ATTR,
        Translate as VanillaTranslate,
        registerBlock,
        renderBlock,
        tSignal,
        warnUnregistered,
        warnUnrenderedBlock,
        type ParamPrimitive,
    } from 'langsys-js-typescript';
    import type { Snippet } from 'svelte';
    import { onDestroy } from 'svelte';
    import RenderedNodes from './RenderedNodes.svelte';
    import { NO_TRANSFORM, paramsOf, type TransformOutput } from './transform.js';

    interface Props {
        class?: string;
        tag?: string;
        label?: string;
        category?: string;
        custom_id?: string;
        params?: Record<string, ParamPrimitive>;
        children: Snippet;
        /** Written by `langsysPreprocess()`; never by hand. */
        __ls?: TransformOutput;
    }

    let { class: clazz = '', tag = 'translate', label = '', category = '', custom_id = '', params = undefined, children, __ls = undefined }: Props = $props();

    const tree = $derived(__ls && 'tree' in __ls ? __ls.tree : undefined);
    const dyn = $derived(__ls && 'tree' in __ls ? __ls.dyn : []);
    // A param the app names itself wins over the build's.
    const options = $derived({
        category,
        label,
        params: paramsOf(__ls && 'tree' in __ls ? __ls.params : undefined, params),
        ...(custom_id ? { id: custom_id } : {}),
    });
    const rendered = $derived.by(() => {
        $tSignal; // re-render on every catalog or locale change
        return tree ? renderBlock(tree, options) : null;
    });

    /**
     * MARK-1 on the vanilla path. There the id is derived by the core's DOM tokenizer in the
     * browser, so the served host carries an id only when the app supplies `custom_id`.
     */
    const stamp = $derived(custom_id ? { [CONTENT_BLOCK_MARKER_ATTR]: custom_id } : {});

    // The notices, once per process per reason, silent with debug off.
    // svelte-ignore state_referenced_locally
    if (!tree) {
        // svelte-ignore state_referenced_locally
        warnUnregistered(__ls && 'fallback' in __ls ? `svelte-fallback: ${__ls.fallback}` : NO_TRANSFORM);
        if (typeof window === 'undefined') warnUnrenderedBlock('string-path-deferred');
    }

    let host = $state<HTMLElement>();
    let instance: VanillaTranslate | undefined;

    $effect(() => {
        if (!host || tree || instance) return;
        instance = new VanillaTranslate(host, { category, custom_id, label, params, register: false });
    });

    // Re-render when params change (e.g. a changed count) after mount.
    $effect(() => {
        const next = params;
        if (instance) instance.setParams(next);
    });

    // The tree path registers what it renders — again on each catalog change, as the core asks.
    $effect(() => {
        if (!host || !tree) return;
        $tSignal;
        registerBlock(tree, { ...options, host });
    });

    onDestroy(() => {
        instance?.destroy();
        instance = undefined;
    });
</script>

{#if rendered}
    <svelte:element this={tag} {...rendered.hostAttrs} class={clazz} bind:this={host}><RenderedNodes nodes={rendered.nodes} {dyn} /></svelte:element>
{:else}
    <svelte:element this={tag} {...stamp} class={clazz} bind:this={host}>
        {@render children?.()}
    </svelte:element>
{/if}
