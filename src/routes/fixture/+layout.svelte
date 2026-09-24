<script lang="ts">
    /**
     * Contract-fixture testbed: the SDK talks to `contract-fixture/server.mjs` (through the
     * dev server's `/__fx` proxy), never to a real API. Driven by `_dev_/contract/verify-contract.mjs`.
     *
     * The layout is the persistent shape HINT-13 is about: it stays mounted across the
     * client-side navigation from `/fixture/a` to `/fixture/b`, and it renders a phrase.
     * `syncNavigation()` is the binding's wiring — the one line a SvelteKit app adds.
     */
    import type { Snippet } from 'svelte';
    import { onMount } from 'svelte';
    import { writable } from 'svelte/store';
    import { page } from '$app/state';
    import { LangsysApp, t } from '$lib/index.js';
    import { syncNavigation } from '$lib/kit.js';
    import { exposeIdentityForVerifier } from '../e2e/harness.js';

    let { children }: { children: Snippet } = $props();

    syncNavigation();

    // Read once: the layout outlives every navigation, and the SDK is initialised once.
    const params = page.url.searchParams;
    const key = params.get('key') ?? 'k-public';
    const testCase = params.get('case') ?? '0';
    const userLocale = writable('en-us');

    let status = $state<'idle' | 'ready' | 'error'>('idle');

    onMount(async () => {
        exposeIdentityForVerifier();
        const res = await LangsysApp.init({
            projectid: 'p1',
            key,
            UserLocaleStore: userLocale,
            baseLocale: 'en-us',
            apiUrl: `${window.location.origin}/__fx/api`,
        });
        status = res.status ? 'ready' : 'error';
    });
</script>

<p data-testid="fx-status">{status}</p>
<p data-testid="fx-layout">{$t(`Layout phrase ${testCase}`, 'FX')}</p>
{@render children()}
