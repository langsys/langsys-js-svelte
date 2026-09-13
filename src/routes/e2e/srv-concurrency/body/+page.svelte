<script lang="ts">
    import { currentlyLoadedLocale, sTranslations, t } from '$lib/index.js';
    import { SRVC_CATEGORY } from '../fixture.js';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // README-SSR's seed: synchronously in the component body, the one position that runs
    // during SSR in the same uninterrupted pass as the `$t()` read below.
    // svelte-ignore state_referenced_locally
    sTranslations.set(data.catalog);
    // svelte-ignore state_referenced_locally
    currentlyLoadedLocale.set(data.locale);
</script>

<p data-testid="srvc" data-locale={data.locale}>{$t('Pricing', SRVC_CATEGORY)}</p>
