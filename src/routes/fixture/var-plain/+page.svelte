<script lang="ts">
    /**
     * VAR-7 testbed: `/fixture/var`'s first block and its one-token unit beside an excluded element,
     * compiled WITHOUT the transform, so on the core's DOM class; and read-only
     * blocks of every shape — one phrase, several, a `<Phrase>`, one mounted after `init()` — for
     * `_dev_/e2e/credentials.mjs`.
     */
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { DontTranslate, Phrase, Translate } from '$lib/index.js';

    const user = $state({ name: page.url.searchParams.get('user') ?? 'Ana' });
    const cms = '<p>Plain CMS text</p>';
    // Mounted well after the layout's `init()` has answered.
    let late = $state(false);
    onMount(() => void setTimeout(() => (late = true), 1000));
</script>

<Translate category="VAR" tag="div"><p id="greet">Hello {user.name}, welcome back</p></Translate>
<Translate category="VAR" tag="div"><p id="built">Built with <DontTranslate>Kangen</DontTranslate></p></Translate>
<!-- eslint-disable-next-line svelte/no-at-html-tags -- constant markup written in this file -->
<Translate category="VAR" tag="div"><div id="cms">{@html cms}</div></Translate>
<Translate category="VAR" tag="div"
    ><p id="plain-multi">First line</p>
    <p>Second line</p></Translate
>
<Phrase category="VAR" tag="p">Signed in as <b>{user.name}</b></Phrase>
{#if late}
    <Translate category="VAR" tag="div"
        ><p id="plain-late">Mounted after init</p>
        <p>And another line</p></Translate
    >
{/if}
