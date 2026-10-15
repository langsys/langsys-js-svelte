<script lang="ts">
    /** Fixture for `dont-translate.test.ts`, compiled WITH the transform. */
    import { DontTranslate, Phrase, Translate } from '$lib/index.js';

    let { email, version, items, ok = true }: { email: string; version: string; items: string[]; ok?: boolean } = $props();
    const user = { name: 'Ana' };
    const owner = { name: 'Bo' };
    const nick = { name: 'NICK' };
</script>

<Phrase category="DT" tag="p">Signed in as <DontTranslate>{email}</DontTranslate> today</Phrase>
<Translate category="DT" tag="div"
    ><p>Account settings</p>
    <Phrase>Mail goes to <DontTranslate>{email}</DontTranslate> first</Phrase></Translate
>
<!-- A phrase reads everything under its host, a nested <Translate> too. -->
<Phrase category="DT" tag="p">By <Translate><DontTranslate>{email}</DontTranslate></Translate> now</Phrase>
<!-- A block stores a value inside its <DontTranslate> as its placeholder. -->
<Translate category="DT" tag="div"
    ><p>Write to <DontTranslate>{email}</DontTranslate> for help</p>
    <p>Thanks</p></Translate
>
<!-- A key the reader produced before the exclusion was opaque, in the catalog. -->
<Phrase category="DT" tag="p">Welcome to <DontTranslate>Langsys</DontTranslate>, <b>friend</b></Phrase>
<!-- A block reads nothing inside its <DontTranslate>, a nested <Phrase> included. -->
<Translate category="DT" tag="div"
    ><p>Hello {email}</p>
    <DontTranslate><Phrase>Version {version}</Phrase></DontTranslate></Translate
>
<!-- A block that falls back (the {#each}): its own <Phrase> is read on its own, under the block's
     category; the one inside its <DontTranslate> is not read. -->
<Translate category="DT" tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    <Phrase>Plain {version}</Phrase>
    <DontTranslate><Phrase>Build {version}</Phrase></DontTranslate></Translate
>
<!-- Nor is one inside a <DontTranslate> outside any block. -->
<DontTranslate><Phrase category="DT">Top {version}</Phrase></DontTranslate>
<!-- A unit whose one token sits beside an excluded element, at the paragraph's edge: the space
     between them is the text node's own. -->
<Translate category="DT" tag="div"><p>Built with <DontTranslate>Kangen</DontTranslate></p></Translate>
<Translate category="DT" tag="div"><p><DontTranslate>Kangen</DontTranslate> is ours</p></Translate>
<!-- What an exclusion holds changes no name in the key. -->
<Phrase category="DT" tag="p">Hi {user.name}, as <DontTranslate>{owner.name}</DontTranslate></Phrase>
<!-- An author's own exclusion is read as a <DontTranslate>: an attribute's text there is a value. -->
<Translate category="DT" tag="div"><p>Photo <span translate="no"><img alt="By {email}" src="data:," /></span> here</p></Translate>
<!-- One block whichever branch its <DontTranslate> shows (VAR-3). -->
<Translate category="DT" tag="div"
    ><p>
        Status <DontTranslate
            >{#if ok}{email}{:else}none{/if}</DontTranslate
        > shown
    </p></Translate
>
<!-- A name written inside an exclusion: on the phrase path the caller's params fill it, in a block it
     stays as written. -->
<Phrase category="DT" tag="p" params={nick}>Hey {user.name}, write to <b translate="no">%name%</b></Phrase>
<Translate category="DT" tag="div"><p>Mail {user.name} at <span translate="no">%name%</span></p></Translate>
