<script lang="ts">
    /** Fixture for `plaintext.test.ts`, compiled WITH the transform. */
    import { Phrase, Translate } from '$lib/index.js';

    let { name }: { name: string } = $props();
</script>

<!-- TOK-1: the sentence once in ordinary markup and again inside a <plaintext>. -->
<Translate category="PT" tag="div"
    ><p>Read the terms</p>
    <plaintext>Read the terms</plaintext></Translate
>
<Translate category="PT" tag="div"
    ><p>Hello {name}</p>
    <plaintext>Hello {name}</plaintext></Translate
>
<Phrase category="PT" tag="p">Read the terms <plaintext>Read the terms</plaintext></Phrase>
<!-- Control: the same shape with an ordinary element, whose text is a token. -->
<Translate category="PT" tag="div"
    ><p>Read the rules</p>
    <span>Read the rules too</span></Translate
>
