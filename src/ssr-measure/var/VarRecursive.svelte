<script lang="ts">
    /**
     * Fixture for `fallback-category.test.ts`: a fallback block that renders another instance of
     * this component inside itself, handing it a unit written in this instance's block.
     */
    import type { Snippet } from 'svelte';
    import { Phrase, Translate } from '$lib/index.js';
    import Self from './VarRecursive.svelte';

    let { c, items, depth = 0, children }: { c: string; items: string[]; depth?: number; children?: Snippet } = $props();
</script>

<Translate category={c} tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    {#if depth === 0}<Self c="Inner" {items} depth={1}><Phrase>Written in the outer one</Phrase></Self>{/if}
    {@render children?.()}</Translate
>
