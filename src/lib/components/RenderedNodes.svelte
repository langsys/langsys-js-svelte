<script lang="ts">
    /**
     * Writes a rendered block's nodes as elements Svelte owns — no HTML string is parsed — so they
     * hydrate like any template and keep their handlers: each element takes back what the build
     * carried beside the text (`dyn`) by its `source` index. Marker comments render nothing.
     */
    import type { RenderedNode } from 'langsys-js-typescript';
    import RenderedNodes from './RenderedNodes.svelte';

    let { nodes, dyn }: { nodes: RenderedNode[]; dyn: Array<Record<string, unknown> | null> } = $props();

    const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

    // An attribute written without a value is `true` in the tree. Svelte's spread renders `true` as
    // the text "true" on every name but the boolean ones it lists (DOM_BOOLEAN_ATTRIBUTES, which it
    // does not export) and `hidden`, which it treats as one, so on any other name it is written
    // empty, as Svelte's own markup writes it. An empty value would drop a boolean one.
    const BOOLEAN_NAMES =
        'allowfullscreen async autofocus autoplay checked controls default disabled formnovalidate indeterminate inert ismap loop multiple muted nomodule novalidate open playsinline readonly required reversed seamless selected webkitdirectory defer disablepictureinpicture disableremoteplayback hidden';
    const BOOLEAN = new RegExp(`^(?:${BOOLEAN_NAMES.replaceAll(' ', '|')})$`, 'i');
    const attrsOf = (attrs: Readonly<Record<string, string | true>>) =>
        Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, value === true && !BOOLEAN.test(name) ? '' : value]));
</script>

{#each nodes as n, i (i)}{#if 'text' in n}{n.text}{:else if 'tag' in n}{#if VOID.has(n.tag)}<svelte:element
                this={n.tag}
                {...attrsOf(n.attrs)}
                {...dyn[n.source] ?? {}}
            />{:else}<svelte:element this={n.tag} {...attrsOf(n.attrs)} {...dyn[n.source] ?? {}}><RenderedNodes nodes={n.children} {dyn} /></svelte:element
            >{/if}{/if}{/each}
