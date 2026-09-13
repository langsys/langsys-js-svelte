<script lang="ts">
    /**
     * Fixture for `served-bytes.test.ts`. Seeds the catalog the way README-SSR.md's
     * "Server-rendering translated copy" pattern does — synchronously, in the component
     * body — and then renders each of the three surfaces SRV-1 names.
     *
     * Lives outside `src/lib` so it never ships: `svelte-package` copies `src/lib`
     * verbatim, and the `files` allowlist excludes test files, not fixtures.
     */
    import { Phrase, Translate, currentlyLoadedLocale, sTranslations, t } from '$lib/index.js';
    import type { iCategories } from 'langsys-js-typescript';

    const props: { catalog: iCategories; locale: string } = $props();

    // Initial values only, on purpose: this mirrors README-SSR.md's one-shot body seed,
    // which runs once per server render.
    // svelte-ignore state_referenced_locally
    sTranslations.set(props.catalog);
    // svelte-ignore state_referenced_locally
    currentlyLoadedLocale.set(props.locale);
</script>

<p id="t-hit">{$t('Pricing', 'SRV')}</p>
<p id="t-miss">{$t('Control miss', 'SRV')}</p>
<Translate category="SRV" tag="div"><p id="translate-hit">Pricing</p></Translate>
<Phrase category="SRV" tag="p">Pricing</Phrase>
