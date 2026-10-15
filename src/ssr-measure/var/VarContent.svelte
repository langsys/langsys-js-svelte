<script lang="ts">
    /** Fixture for `block-content.test.ts`, compiled WITH the transform. */
    import { Phrase, Translate } from '$lib/index.js';

    let { name }: { name: string } = $props();
    const user = $derived({ name });
    const owner = { name: 'Bo' };
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
<!-- A name written by hand: stored as the placeholder a marked value is stored as. -->
<Translate category="CONTENT" tag="div" params={{ name }}
    ><p title="To %name%">Hello %name%, again</p>
    <p>Written by hand</p></Translate
>
<!-- A nested unit names its own values: the phrase keys and renders as it does standing alone. -->
<Translate category="NAMES" tag="div"
    ><p>Hi {user.name}</p>
    <Phrase tag="p">By {owner.name}</Phrase></Translate
>
<Phrase category="NAMES" tag="p">By {owner.name}</Phrase>
