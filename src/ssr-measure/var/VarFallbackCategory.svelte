<script lang="ts">
    /** Fixture for `fallback-category.test.ts`, compiled WITH the transform. */
    import { Phrase, Translate } from '$lib/index.js';
    import VarWrapper from './VarWrapper.svelte';

    let {
        version,
        items,
        section,
        own,
        block,
        unset,
        next,
    }: {
        version: string;
        items: string[];
        section: string;
        own: { category: string };
        block: { category: string; tag: string };
        unset: string | undefined;
        next: () => string;
    } = $props();
</script>

<!-- A category the block computes, with an {#each} inside reusing its name. -->
<Translate category={section} tag="div"
    ><ul>
        {#each items as section (section)}<li>{section}</li>
            <Phrase>Each {version}</Phrase>{/each}
    </ul>
    <Phrase>Computed {version}</Phrase></Translate
>
<!-- Computed once: the unit takes the value the block got. -->
<Translate category={next()} tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    <Phrase>Once {version}</Phrase></Translate
>
<!-- Text with a value in it, the value unset; and the value alone, unset. -->
<Translate category="Shop{unset}" tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    <Phrase>Text unset {version}</Phrase></Translate
>
<Translate category={unset} tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    <Phrase>Alone unset {version}</Phrase></Translate
>
<!-- A spread can name the unit's category, and give the block its own. -->
<Translate category="DT" tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    <Phrase {...own}>Spread {version}</Phrase></Translate
>
<Translate {...block}
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    <Phrase>Block spread {version}</Phrase></Translate
>
<!-- An empty category is the block's, as it is inside a block that is read. -->
<Translate category="Out" tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    <Phrase category="">Empty {version}</Phrase></Translate
>
<!-- A fallback inside a fallback, naming none: its units take the outer one's. -->
<Translate category="Outer" tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    <Translate tag="div"
        ><ul>
            {#each items as item (item)}<li>{item}</li>{/each}
        </ul>
        <Phrase>Deep {version}</Phrase></Translate
    ></Translate
>
<!-- A unit is in the block it is written in, not one another component wraps it in. -->
<Translate category="A" tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    <VarWrapper {items}><Phrase>Lexical {version}</Phrase></VarWrapper></Translate
>
