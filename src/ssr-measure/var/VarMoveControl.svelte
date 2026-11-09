<script lang="ts">
    /** Fixture for `move.test.ts`: VarMove's first block as written before it moved, with no previous category, under `category`. */
    import { Phrase, Translate } from '$lib/index.js';

    let { name, category = 'Checkout' }: { name: string; category?: string } = $props();
</script>

<Translate {category} tag="div"
    ><p>Moved block {name}</p>
    <p>Second paragraph</p>
    <Phrase>Nested moved {name}</Phrase></Translate
>
