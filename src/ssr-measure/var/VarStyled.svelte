<script lang="ts">
    /**
     * Fixture for `var-styled.test.ts` and `/fixture/var-styled`, compiled WITH the transform (see
     * `varTransform` in vite.config.ts): a component's scoped styles on elements written inside its
     * `<Translate>` and `<Phrase>`, with `#outside` the control written outside them, and an
     * attribute that mixes text with a value that may be unset.
     */
    import { Phrase, Translate } from '$lib/index.js';

    let { name, uid }: { name: string; uid?: string | number | null } = $props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- the href is an attribute value under test, not a route -->
<p class="title outside">Outside</p>
<Translate category="VAR"
    ><h1 class="title">Hi {name}</h1>
    <a class="link" href="/u/{uid}">Profile</a></Translate
>
<Phrase category="VAR">Hi <b class="em">{name}</b>, welcome</Phrase>

<style>
    .title {
        color: rgb(255, 0, 0);
    }
    .link {
        letter-spacing: 3px;
    }
    b.em {
        font-weight: 900;
    }
</style>
