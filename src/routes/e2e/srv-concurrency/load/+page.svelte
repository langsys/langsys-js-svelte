<script lang="ts">
    import { t } from '$lib/index.js';
    import { SRVC_CATEGORY } from '../fixture.js';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!-- No seed here: `load` already wrote the process-global catalog, then awaited. -->
<p data-testid="srvc" data-locale={data.locale}>{$t('Pricing', SRVC_CATEGORY)}</p>
