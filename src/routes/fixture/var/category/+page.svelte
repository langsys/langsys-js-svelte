<script lang="ts">
    /**
     * VAR-6 in the browser: a unit the build reads on its own inside a fallback block takes the
     * category the block renders with, after hydration and when it changes. Compiled WITH the
     * transform (see `varTransform` in vite.config.ts). Driven by `_dev_/e2e/var.mjs`.
     */
    import { page } from '$app/state';
    import { Translate } from '$lib/index.js';

    const user = $state({ name: page.url.searchParams.get('user') ?? 'Ana' });
    const items = [0];
    let section = $state('VAR');
</script>

<button id="switch" onclick={() => (section = 'VAR2')}>Switch</button>
<!-- Control: the same block in no fallback, under the category it names. -->
<Translate category="VAR" tag="div"><img id="alone" alt="Picture of {user.name}" src="data:," /></Translate>
<Translate category={section} tag="div"
    ><ul>
        {#each items as item (item)}<li>{item}</li>{/each}
    </ul>
    <Translate tag="div"><img id="picture" alt="Picture of {user.name}" src="data:," /></Translate></Translate
>
