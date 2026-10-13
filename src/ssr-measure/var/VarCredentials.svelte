<script lang="ts">
    /** Fixture for `require-credentials.test.ts`, compiled WITH the transform. */
    import { Phrase, Translate } from '$lib/index.js';

    const props: { name: string } = $props();
</script>

<Translate category="CRED" tag="div"><p id="greet">Hello {props.name}, welcome back</p></Translate>
<Translate category="CRED" tag="div"><p id="static">A static sentence</p></Translate>
<Phrase category="CRED" tag="p">Signed in as <b>{props.name}</b></Phrase>
<Translate category="CRED" tag="div"
    ><ul id="each">
        {#each [1, 2] as i (i)}<li>Item {i}</li>{/each}
    </ul></Translate
>
