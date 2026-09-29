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
</script>

{#each nodes as n, i (i)}{#if 'text' in n}{n.text}{:else if 'tag' in n}{#if VOID.has(n.tag)}<svelte:element this={n.tag} {...n.attrs} {...dyn[n.source] ?? {}} />{:else}<svelte:element this={n.tag} {...n.attrs} {...dyn[n.source] ?? {}}><RenderedNodes nodes={n.children} {dyn} /></svelte:element>{/if}{/if}{/each}
