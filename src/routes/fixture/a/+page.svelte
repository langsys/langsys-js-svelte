<script lang="ts">
    import { page } from '$app/state';
    import { t } from '$lib/index.js';

    const testCase = page.url.searchParams.get('case') ?? '0';
</script>

<!-- Only page A renders this; the navigation to B unmounts it. -->
<p data-testid="fx-a">{$t(`Page A only ${testCase}`, 'FX')}</p>
<a data-testid="fx-to-b" href="/fixture/b?case={testCase}">to B</a>
