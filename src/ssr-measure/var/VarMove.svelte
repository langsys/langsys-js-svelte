<script lang="ts">
    /** Fixture for `move.test.ts`, compiled WITH the transform: content moved between categories (MOVE-1). */
    import { inCategory, Phrase, t, Translate } from '$lib/index.js';

    let { name, items, from }: { name: string; items: string[]; from: string } = $props();
</script>

<!-- A block read as a tree, moved; a nested unit in its category moves with it. -->
<Translate category="Checkout" previousCategory="Header" tag="div"
    ><p>Moved block {name}</p>
    <p>Second paragraph</p>
    <Phrase>Nested moved {name}</Phrase></Translate
>
<!-- Control: the same block, not moved, in a category of its own. -->
<Translate category="Plain" tag="div"
    ><p>Moved block {name}</p>
    <p>Second paragraph</p></Translate
>
<!-- A phrase read as a tree, moved. -->
<Phrase category="Checkout" previousCategory="Header">Moved phrase {name}</Phrase>
<!-- A block that falls back: its own units take its category and its previous category, unless
     they name a category of their own. -->
<Translate category="Cart" previousCategory={from} tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    <Phrase>Fallback unit {name}</Phrase>
    <Phrase category="Own">Own unit {name}</Phrase></Translate
>
<!-- `$t` with a template literal: the build's runtime path, a ref in the category position. -->
<p>{$t(`Moved call ${name}`, inCategory('Checkout', { previousCategory: 'Header' }))}</p>
