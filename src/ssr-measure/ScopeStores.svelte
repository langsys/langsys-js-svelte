<script lang="ts">
    /** Fixture for `scope-stores.test.ts`: the three exported catalog stores, read with `$`. */
    import { currentlyLoadedLocale, sTranslations, t } from '$lib/index.js';
</script>

<p id="t">{$t('Pricing', 'SRVC')}</p>
<p id="locale">{$currentlyLoadedLocale}</p>
<p id="catalog">{($sTranslations as Record<string, Record<string, string>>).SRVC?.Pricing ?? ''}</p>
