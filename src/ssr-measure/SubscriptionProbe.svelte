<script lang="ts">
    /**
     * Fixture for `ssr-subscriptions.test.ts`: every store this binding exports read with `$`,
     * both components, and the two controls — one subscription released in `onDestroy`, one never
     * released — selected by `control`.
     */
    import { onDestroy } from 'svelte';
    import { DontTranslate, Phrase, Translate, currentlyLoadedLocale, serverMessage, sTranslations, t, writeEnabled } from '$lib/index.js';

    let { control = 'none' }: { control?: 'none' | 'released' | 'leaked' } = $props();

    // svelte-ignore state_referenced_locally
    if (control !== 'none') {
        const stop = t.subscribe(() => {});
        if (control === 'released') onDestroy(stop);
    }

    const entry = { template: 'Probe message', message: 'Probe message' };
</script>

<p>{$t('Probe', 'SSR')}</p>
<p>{$currentlyLoadedLocale}</p>
<p>{Object.keys($sTranslations).length}</p>
<p>{String($writeEnabled)}</p>
<p>{$serverMessage(entry)}</p>
<Translate category="SSR"><p>Probe block</p></Translate>
<Phrase category="SSR">Probe <b>phrase</b></Phrase>
<DontTranslate>verbatim</DontTranslate>
