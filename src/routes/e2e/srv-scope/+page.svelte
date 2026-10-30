<script lang="ts">
    import { t } from '$lib/index.js';
    import { SRVC_CATEGORY } from '../srv-concurrency/fixture.js';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!-- No seed here: whatever `t` reads must come from this request's scope. -->
<p data-testid="srvc" data-locale={data.locale}>{$t('Pricing', SRVC_CATEGORY)}</p>
{#if data.miss}
    <!-- A phrase the scope's catalog lacks: its miss is this scope's, flushed after the response (SRV-3). -->
    <p data-testid="srvc-miss">{$t(data.miss, SRVC_CATEGORY)}</p>
{/if}
