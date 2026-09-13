<script lang="ts">
    import { page } from '$app/state';
    import { t } from '$lib/index.js';
    import { CATEGORY, DEFAULT_RUN, phrase } from '../../harness.js';

    const run = $derived(page.url.searchParams.get('run') ?? DEFAULT_RUN);

    /**
     * Positive control for the layout's re-entry probe: an ordinary page component,
     * mounted BY the client-side navigation, entering `t()` at the new URL. Without it,
     * "the layout recorded nothing at the new URL" could equally mean the probe cannot
     * see entries at that URL at all.
     */
    function countedT(p: string, category: string): string {
        // Guarded: a direct visit server-renders this page, where there is no window.
        if (typeof window !== 'undefined') {
            const w = window as unknown as { __lsEntries?: { where: string; url: string }[] };
            (w.__lsEntries ??= []).push({ where: 'page', url: window.location.href });
        }
        return $t(p, category);
    }
</script>

<h1>Elsewhere</h1>

<div class="expect">
    You arrived by client-side navigation, so the app never remounted and the pending hint from
    <code>/e2e/nav</code> is still counting down in the same module instance.
</div>

<div class="card">
    <h2>Misses on this URL</h2>
    <p>{countedT(phrase('nav-elsewhere', 1, run), CATEGORY)}</p>
    <div class="expect">
        These belong to <code>/e2e/nav/elsewhere</code>. Pending hints are keyed by captured URL, so this must arrive as its <strong>own</strong> hint — one per URL
        — never batched with the origin page's misses under a single URL.
    </div>
</div>

<p class="mono"><a href="/e2e/nav?run={run}">← back to /e2e/nav</a></p>
