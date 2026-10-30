<script lang="ts">
    /**
     * Fixture for `scope-stores.test.ts`: the three exported catalog stores read with `$`, the
     * server-message store, and the core's locale header — every read a server render makes.
     */
    import { LangsysApp, currentlyLoadedLocale, sTranslations, serverMessage, t } from '$lib/index.js';
</script>

<p id="t">{$t('Pricing', 'SRVC')}</p>
<p id="locale">{$currentlyLoadedLocale}</p>
<p id="catalog">{($sTranslations as Record<string, Record<string, string>>).SRVC?.Pricing ?? ''}</p>
<p id="message">{$serverMessage({ template: 'Pricing', message: 'as the server wrote it' }, 'SRVC')}</p>
<p id="header">{LangsysApp.localeHeaders()['Accept-Language'] ?? ''}</p>
