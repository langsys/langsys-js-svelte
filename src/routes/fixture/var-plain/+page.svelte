<script lang="ts">
    /** VAR-7 testbed: `/fixture/var`'s first block, compiled WITHOUT the transform. */
    import { page } from '$app/state';
    import { Translate } from '$lib/index.js';

    const user = $state({ name: page.url.searchParams.get('user') ?? 'Ana' });
    const cms = '<p>Plain CMS text</p>';
</script>

<Translate category="VAR" tag="div"><p id="greet">Hello {user.name}, welcome back</p></Translate>
<Translate category="VAR" tag="div"><div id="cms">{@html cms}</div></Translate>
