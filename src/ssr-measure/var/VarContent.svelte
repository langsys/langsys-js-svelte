<script lang="ts">
    /** Fixture for `block-content.test.ts`, compiled WITH the transform. */
    import { Phrase, Translate } from '$lib/index.js';

    let { name }: { name: string } = $props();
    const user = $derived({ name });
    const owner: { name: string; nick?: string } = { name: 'Bo' };
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
<!-- A value a nested unit leaves unset shows empty, as it does standing alone, however deep the unit. -->
<Translate category="NAMES" tag="div"
    ><p>Hey {user.name}</p>
    <div><section><Phrase tag="p">For {owner.nick}</Phrase></section></div></Translate
>
<Phrase category="NAMES" tag="p">For {owner.nick}</Phrase>
<!-- An attribute's value inside a phrase is shown, standing alone and nested in a block. -->
<Phrase category="NAMES" tag="p">Hello <abbr title="Profile of {user.name}">{user.name}</abbr></Phrase>
<Translate category="NAMES" tag="div"
    ><p>Photos</p>
    <Phrase tag="p">Taken <img alt="Pic of {user.name}" src="data:," /> today</Phrase></Translate
>
<!-- A submit input's label is text a translator reads: a value in it is a placeholder. -->
<Translate category="NAMES" tag="div"
    ><p>Send it</p>
    <input type="submit" value="Send to {user.name}" /></Translate
>
<!-- A name written by hand in a phrase beside a value: the caller's params fill it, as source and translated. -->
<Phrase category="NAMES" tag="p" params={{ who: 'NICK' }}>Hey %who%, from {user.name}</Phrase>
<Translate category="NAMES" tag="div"
    ><p>Notes</p>
    <Phrase tag="p" params={{ who: 'NICK' }}>Hey %who%, from {user.name}</Phrase></Translate
>
<!-- An attribute written without a value renders empty, and a boolean one present. -->
<Translate category="NAMES" tag="div"
    ><p hidden>Valueless</p>
    <button disabled>Go</button></Translate
>
