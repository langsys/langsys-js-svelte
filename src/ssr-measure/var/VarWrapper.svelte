<script lang="ts">
    /** Fixture for `fallback-category.test.ts`: a fallback block of its own around what it is handed. */
    import type { Snippet } from 'svelte';
    import { Phrase, Translate } from '$lib/index.js';

    let { items, children }: { items: string[]; children: Snippet } = $props();
</script>

<Translate category="W" tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    <Phrase>Wrapped</Phrase>
    {@render children()}</Translate
>
