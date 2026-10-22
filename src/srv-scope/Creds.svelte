<script lang="ts">
    /** Fixture for `credentials.contract.test.ts`: a phrase the catalog holds, and one it lacks. */
    import { t } from '$lib/index.js';

    let { miss }: { miss: string } = $props();
</script>

<p>{$t('Hello', 'UI')}</p>
<p>{$t(miss, 'UI')}</p>
