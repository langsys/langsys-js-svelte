<script lang="ts">
    /**
     * Phrase — one markup-bearing sentence, kept whole.
     *
     * Use inside (or outside) <Translate> so a run with inline markup is ONE translatable phrase —
     * e.g. so a count stays next to the noun it pluralizes:
     *
     *   <Phrase category="ProductCard">Based on {reviewCount} <strong>reviews</strong></Phrase>
     *
     * With `langsysPreprocess()` in svelte.config.js this registers
     * `Based on {review_count} {m0o}reviews{m0c}` once, with the count as a typed param, and
     * renders through the core's `renderBlock` on the server as in the browser. The inline markup
     * never reaches the translator: it becomes neutral `m<N>o`/`m<N>c` tokens and the real
     * elements are rebuilt at render.
     *
     * Without the transform, or when the build cannot read the phrase, the vanilla `Phrase` handler
     * translates the rendered DOM after mount and registers nothing (VAR-7). A name written
     * explicitly — `%n%` with `params={{ n }}` — works on both paths. The host carries the core's
     * `PHRASE_MARKER_ATTR`, so a wrapping <Translate> leaves it to this component.
     */
    import {
        PHRASE_MARKER_ATTR,
        Phrase as VanillaPhrase,
        registerBlock,
        renderBlock,
        tSignal,
        warnUnregistered,
        warnUnrenderedBlock,
        type BlockNode,
        type ParamPrimitive,
    } from 'langsys-js-typescript';
    import type { Snippet } from 'svelte';
    import { onDestroy } from 'svelte';
    import RenderedNodes from './RenderedNodes.svelte';
    import { NO_TRANSFORM, paramsOf, type TransformOutput } from './transform.js';

    interface Props {
        class?: string;
        tag?: string;
        category?: string;
        params?: Record<string, ParamPrimitive>;
        children: Snippet;
        /** Written by `langsysPreprocess()`; never by hand. */
        __ls?: TransformOutput;
    }

    let { class: clazz = '', tag = 'span', category = '', params = {}, children, __ls = undefined }: Props = $props();

    /**
     * The skip marker, spread so the attribute NAME comes from the core rather
     * than being restated here. `Translate`/`tokenizeElement` skip a marked
     * subtree via `isPhraseMarked()`, which reads the core's own constant — so a
     * hardcoded literal that drifted from it would stop this host being skipped,
     * and the markup-bearing run would be tokenized in pieces. That is precisely
     * the split `<Phrase>` exists to prevent, and it would fail silently.
     */
    const markerAttr = { [PHRASE_MARKER_ATTR]: '' };

    /**
     * SRV-1's sanctioned fallback, reported. On the server this component holds its children only
     * as a render function, and the core's block renderer takes a node tree, not the HTML a render
     * function produces; so the block is served as source and translated after mount. The core
     * reports that once per process per reason.
     */
    // A component's transform output never changes after it is created.
    // svelte-ignore state_referenced_locally
    if (!(__ls && 'tree' in __ls)) {
        warnUnregistered(__ls && 'fallback' in __ls ? `svelte-fallback: ${__ls.fallback}` : NO_TRANSFORM);
        if (typeof window === 'undefined') warnUnrenderedBlock('string-path-deferred');
    }

    /**
     * With the transform, the phrase is a tree whose root is this host, marked, so the core renders
     * it as one rich phrase (`m0o`…`m0c` for its inline markup) on the server as in the browser.
     */
    const tree = $derived<BlockNode[] | undefined>(
        __ls && 'tree' in __ls ? [{ tag, attrs: { ...markerAttr, ...(clazz ? { class: clazz } : {}) }, children: __ls.tree }] : undefined
    );
    // The host is element 0 of the tree, so the build's entries start at 1.
    const dyn = $derived(__ls && 'tree' in __ls ? [null, ...__ls.dyn] : []);
    const options = $derived({ category, params: paramsOf(__ls && 'tree' in __ls ? __ls.params : undefined, params) });
    const root = $derived.by(() => {
        if (!tree) return undefined;
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- reading the store is the dependency: re-render on every catalog or locale change
        $tSignal;
        const node = renderBlock(tree, options).nodes[0];
        return node && 'tag' in node ? node : undefined;
    });

    let host = $state<HTMLElement>();
    let instance: VanillaPhrase | undefined;

    $effect(() => {
        if (!host || tree || instance) return;
        instance = new VanillaPhrase(host, { category, params, register: false });
    });

    $effect(() => {
        if (!host || !tree) return;
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- re-register on every catalog change
        $tSignal;
        registerBlock(tree, { ...options, host });
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

{#if root}
    <svelte:element this={root.tag} {...root.attrs} bind:this={host}><RenderedNodes nodes={root.children} {dyn} /></svelte:element>
{:else}
    <svelte:element this={tag} {...markerAttr} class={clazz} bind:this={host}>
        {@render children?.()}
    </svelte:element>
{/if}
