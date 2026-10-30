<script lang="ts">
    /**
     * Writes a rendered block's nodes as elements Svelte owns — no HTML string is parsed — so they
     * hydrate like any template and keep their handlers. Used for a block the build hands no
     * `render` snippet; the build's own snippet writes the same nodes in the component the block is
     * written in, where they take that component's scoped styles.
     */
    import type { PreparedNode } from './transform.js';
    import RenderedNodes from './RenderedNodes.svelte';

    let { nodes }: { nodes: PreparedNode[] } = $props();
</script>

{#each nodes as n, i (i)}{#if 'text' in n}{n.text}{:else if n.void}<svelte:element this={n.tag} {...n.attrs} />{:else}<svelte:element this={n.tag} {...n.attrs}
            ><RenderedNodes nodes={n.children} /></svelte:element
        >{/if}{/each}
