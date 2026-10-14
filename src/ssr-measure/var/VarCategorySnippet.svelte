<script lang="ts">
    // @ts-nocheck
    /**
     * Fixture for `fallback-category.test.ts`, compiled WITH the transform. Unchecked: a {#snippet}
     * written directly in a <Translate> is a prop it does not declare, which TypeScript rejects
     * and JavaScript allows.
     */
    import { Phrase, Translate } from '$lib/index.js';

    let { version, items, section, list } = $props();
</script>

<!-- A {#snippet} written directly in a block is a prop of it, outside the block's children. -->
<Translate category={section} tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    {#snippet line()}<Phrase>Line {version}</Phrase>{/snippet}
    {@render line()}</Translate
>
<!-- A parameter named like a name the category's own function reads. -->
<Translate category={list.map((c) => c.n).join()} tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    {#snippet arrow(c)}<i>{c}</i><Phrase>Arrow {version}</Phrase>{/snippet}
    {@render arrow(1)}</Translate
>
