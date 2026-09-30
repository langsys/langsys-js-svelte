<script lang="ts">
    /**
     * VAR-6 testbed: this route is compiled WITH the transform (see `varTransform` in vite.config.ts),
     * and `/fixture/var-plain` with the same first block WITHOUT it. Driven by `_dev_/e2e/var.mjs`.
     */
    import { page } from '$app/state';
    import { Phrase, Translate } from '$lib/index.js';

    const params = page.url.searchParams;
    const user = $state({ name: params.get('user') ?? 'Ana' });
    const items = $state(Array.from({ length: Number(params.get('n') ?? 3) }, (_, i) => i));
</script>

<Translate category="VAR" tag="div"><p id="greet">Hello {user.name}, welcome back</p></Translate>
<Translate category="VAR" tag="div"
    ><p id="cart">You have {items.length} items</p>
    <button id="add" onclick={() => items.push(items.length)}>Add one</button></Translate
>
<Phrase category="VAR" tag="p">Signed in as <b id="who">{user.name}</b></Phrase>
<Translate category="VAR" tag="div"
    ><ul id="list">
        {#each items as i (i)}<li>Item {i}</li>{/each}
    </ul></Translate
>
