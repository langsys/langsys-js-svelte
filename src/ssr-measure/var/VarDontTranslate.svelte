<script lang="ts">
    /** Fixture for `dont-translate.test.ts`, compiled WITH the transform. */
    import { DontTranslate, Phrase, Translate } from '$lib/index.js';

    let { email, version }: { email: string; version: string } = $props();
</script>

<Phrase category="DT" tag="p">Signed in as <DontTranslate>{email}</DontTranslate> today</Phrase>
<Translate category="DT" tag="div"
    ><p>Account settings</p>
    <Phrase>Mail goes to <DontTranslate>{email}</DontTranslate> first</Phrase></Translate
>
<!-- A phrase reads everything under its host, a nested <Translate> too. -->
<Phrase category="DT" tag="p">By <Translate><DontTranslate>{email}</DontTranslate></Translate> now</Phrase>
<!-- A block reads nothing inside its <DontTranslate>, a nested <Phrase> included. -->
<Translate category="DT" tag="div"
    ><p>Hello {email}</p>
    <DontTranslate><Phrase>Version {version}</Phrase></DontTranslate></Translate
>
