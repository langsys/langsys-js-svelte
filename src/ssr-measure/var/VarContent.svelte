<script lang="ts">
    /** Fixture for `block-content.test.ts`, compiled WITH the transform. */
    import { Phrase, Translate } from '$lib/index.js';

    let { name }: { name: string } = $props();
    const user = $derived({ name });
    const owner: { name: string; nick?: string } = { name: 'Bo' };
    const since = new Date(2026, 9, 18);
    const project = { name: 'Atlas' };
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
<!-- A plural written in a phrase beside a value, split by markup or by the value in a branch: as source it renders as translated. -->
<Phrase category="NAMES" tag="p" params={{ n: 3 }}
    >You have &lbrace;n, plural, one &lbrace;<b>#</b> item&rbrace; other &lbrace;<b>#</b> items&rbrace;&rbrace; from {user.name}</Phrase
>
<Phrase category="NAMES" tag="p" params={{ n: 1 }}
    >&lbrace;n, plural, one &lbrace;# file for {user.name}&rbrace; other &lbrace;# files for {user.name}&rbrace;&rbrace;</Phrase
>
<!-- A Date beside a plural in a phrase, or a whole branch of it: a date for the locale, as source and translated. -->
<Phrase category="NAMES" tag="p" params={{ n: 2 }}>&lbrace;n, plural, one &lbrace;# change&rbrace; other &lbrace;# changes&rbrace;&rbrace; since {since}</Phrase
>
<Phrase category="NAMES" tag="p" params={{ n: 0 }}>&lbrace;n, plural, =0 &lbrace;{since}&rbrace; other &lbrace;# edits since {since}&rbrace;&rbrace;</Phrase>
<!-- In a phrase holding a plural an apostrophe before a value or an element quotes it, as ICU does, and one written twice is an apostrophe. Without a plural it is text. -->
<Phrase category="NAMES" tag="p" params={{ n: 2 }}
    >Delete '{project.name}' and its &lbrace;n, plural, one &lbrace;# file&rbrace; other &lbrace;# files&rbrace;&rbrace;?</Phrase
>
<Phrase category="NAMES" tag="p" params={{ n: 2 }}
    >Remove ''{project.name}'' and its &lbrace;n, plural, one &lbrace;# file&rbrace; other &lbrace;# files&rbrace;&rbrace;?</Phrase
>
<Phrase category="NAMES" tag="p" params={{ n: 2 }}
    >Type '<code>DELETE</code>' to remove &lbrace;n, plural, one &lbrace;# file&rbrace; other &lbrace;# files&rbrace;&rbrace;</Phrase
>
<Phrase category="NAMES" tag="p">Rename '{project.name}' now</Phrase>
<!-- An attribute written without a value renders empty, and a boolean one present. -->
<Translate category="NAMES" tag="div"
    ><p hidden>Valueless</p>
    <button disabled>Go</button></Translate
>
