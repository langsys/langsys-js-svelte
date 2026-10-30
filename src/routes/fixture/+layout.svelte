<script lang="ts">
    /**
     * Contract-fixture testbed: the SDK talks to `contract-fixture/forwarder.mjs`, in front of an
     * SDK test clone, through the dev server's `/__fx` proxy. Each page names its case's project and
     * key in its query. Driven by `_dev_/contract/verify-contract.mjs` and the `_dev_/e2e` harnesses.
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
    const project = params.get('project') ?? 'p1';
    const key = params.get('key') ?? 'k-public';
    const testCase = params.get('case') ?? '0';
    const userLocale = writable(params.get('locale') ?? 'en-us');

    let status = $state<'idle' | 'ready' | 'error'>('idle');

    onMount(async () => {
        exposeIdentityForVerifier();
        // For `_dev_/e2e/locale-race.mjs`: switch the user's locale as an app's picker would.
        (window as unknown as { __fxSetLocale: (locale: string) => void }).__fxSetLocale = (locale) => userLocale.set(locale);
        const res = await LangsysApp.init({
            projectid: project,
            key,
            UserLocaleStore: userLocale,
            baseLocale: 'en-us',
            apiUrl: `${window.location.origin}/__fx/api`,
            debug: params.has('debug'),
            requireCredentials: params.has('require'),
        });
        status = res.status ? 'ready' : 'error';
    });
</script>

<p data-testid="fx-status">{status}</p>
<p data-testid="fx-layout">{$t(`Layout phrase ${testCase}`, 'FX')}</p>
{@render children()}
