<script lang="ts">
    /**
     * Fixture for `messages.test.ts` — the client half of MSG-12. A server SDK whose framework
     * redirects after a failed form (Inertia) shares the entries as a page prop; the page finds
     * them with the core's `resolveServerMessages` and renders each through `$serverMessage`.
     * The prop's name is configuration (MSG-1): this page is told it through `messagesKey`. The
     * framework's own `errors` prop travels beside it untouched.
     */
    import { resolveServerMessages, serverMessage } from '$lib/index.js';

    let { pageProps, messagesKey }: { pageProps: Record<string, unknown>; messagesKey: string } = $props();

    const entries = $derived(resolveServerMessages(pageProps, { key: messagesKey }));
</script>

<ul>
    {#each entries as entry, i (i)}
        <li data-field={entry.field ?? ''} data-code={entry.code}>{$serverMessage(entry)}</li>
    {/each}
</ul>
