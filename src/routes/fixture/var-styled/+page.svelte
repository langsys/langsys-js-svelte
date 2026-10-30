<script lang="ts">
    /**
     * For `_dev_/e2e/svelte-dom.mjs`: a component's scoped styles on the elements of its transformed
     * blocks (`VarStyled.svelte`), served and hydrated (`#served`), and mounted in the browser after
     * hydration (`#mounted`). Needs no API: the blocks render their source.
     */
    import { onMount } from 'svelte';
    import VarStyled from '../../../ssr-measure/var/VarStyled.svelte';

    let mounted = $state(false);
    onMount(() => {
        mounted = true;
    });
</script>

<div id="served"><VarStyled name="Ana" /></div>
<div id="mounted">
    {#if mounted}<VarStyled name="Luis" />{/if}
</div>
