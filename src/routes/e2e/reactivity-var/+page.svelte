<script lang="ts">
    /**
     * Reactive values inside blocks the build transform reads: `/e2e/reactivity`'s cases, rendered by
     * `VarReactive.svelte`, which is compiled with the transform. Driven by `_dev_/e2e/svelte-dom.mjs`.
     */
    import { LangsysApp, type iCategories } from '$lib/index.js';
    import VarReactive from '../../../ssr-measure/var/VarReactive.svelte';

    let name = $state('Sarah');
    let label = $state('Alpha');

    (window as unknown as Record<string, unknown>).__reactivityVar = {
        change: () => {
            name = 'Bob';
            label = 'Beta';
        },
        ids: () => ['#block', '#option'].map((root) => document.querySelector(`${root} [data-ls-contentblock]`)?.getAttribute('data-ls-contentblock') ?? null),
        seed: (catalog: iCategories) => LangsysApp.seedCatalog(catalog, 'en-us'),
    };
</script>

<VarReactive {name} {label} />
