<script lang="ts">
    /** Fixture for `block-content.test.ts`, compiled WITH the transform. */
    import { Phrase, Translate } from '$lib/index.js';

    let { name }: { name: string } = $props();
</script>

<Translate category="CONTENT" tag="div"
    ><p>Welcome back, {name}</p>
    <p>Your photos are below</p>
    <Translate tag="section"
        ><p>Taken by {name}</p>
        <p>Last week</p></Translate
    >
    <Phrase tag="p">Signed in as <b>{name}</b></Phrase></Translate
>
<!-- Control: an element opted out of being a block is the outer block's own content. -->
<Translate category="CONTENT" tag="div"
    ><p>Opted out below</p>
    <div data-ls-contentblock="false"><p>Kept with the outer block</p></div></Translate
>
