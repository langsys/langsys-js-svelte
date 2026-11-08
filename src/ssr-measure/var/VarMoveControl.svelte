<script lang="ts">
    /** Fixture for `move.test.ts`: VarMove's first block as written before it moved, with no previous category. */
    import { Phrase, Translate } from '$lib/index.js';

    let { name }: { name: string } = $props();
</script>

<Translate category="Checkout" tag="div"
    ><p>Moved block {name}</p>
    <p>Second paragraph</p>
    <Phrase>Nested moved {name}</Phrase></Translate
>
