<script lang="ts">
    /** Fixture for `dont-translate.test.ts`, compiled WITH the transform. */
    import { DontTranslate, Phrase, Translate } from '$lib/index.js';

    let { email, version, items }: { email: string; version: string; items: string[] } = $props();
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
