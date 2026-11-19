<script lang="ts">
    /**
     * Fixture for `move.contract.test.ts`, compiled WITH the transform: content the clone holds under
     * `Header` (and one phrase with no category), now written under `Checkout` (MOVE-1).
     */
    import { inCategory, Phrase, t, Translate } from '$lib/index.js';
</script>

<Phrase category="Checkout" previousCategory="Header" tag="p">Buy now</Phrase>
<p id="call">{$t('Sign in', inCategory('Checkout', { previousCategory: 'Header' }))}</p>
<Translate category="Checkout" previousCategory="Header" tag="div"
    ><p>Moved block</p>
    <p>Second paragraph</p></Translate
>
<Phrase category="Checkout" previousCategory="" tag="p">Plain buy</Phrase>
<!-- Control: `Header` holds it too, and this one names no move. -->
<Phrase category="Checkout" tag="p">Not moved</Phrase>
