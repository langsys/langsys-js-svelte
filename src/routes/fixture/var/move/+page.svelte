<script lang="ts">
    /**
     * MOVE-4 and MOVE-5 in the browser: content the clone holds under `Header`, written under
     * `Checkout`, served from `Header`'s entries and hydrated against a catalog with nothing under
     * `Checkout`. The same page `move.contract.test.ts` renders on the server, compiled WITH the
     * transform. Driven by `_dev_/contract/move-hydrate.mjs`.
     */
    import VarMoveClone from '../../../../ssr-measure/var/VarMoveClone.svelte';
</script>

<VarMoveClone />
