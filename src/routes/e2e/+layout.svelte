<script lang="ts">
    import type { Snippet } from 'svelte';
    import { page } from '$app/state';
    import { t } from '$lib/index.js';

    /**
     * Re-entry probe for BIND-5. The core records a discovery miss PER URL, before
     * its registration dedup — so whether a phrase rendered in a persistent
     * component re-enters `t()` on a client-side navigation decides whether that
     * phrase is ever attributed to the second URL.
     *
     * Angular's pipe memo suppressed exactly this. Svelte has no memo in the path,
     * but "no memo" and "re-enters" are different claims: a layout does not remount
     * across navigation, so re-entry depends on Svelte's own invalidation, not on us.
     * Counted rather than assumed. Exposed on `window` for the harness to read.
     */
    let reentryCount = 0;
    function countedT(phrase: string, category: string): string {
        reentryCount += 1;
        if (typeof window !== 'undefined') {
            (window as unknown as Record<string, unknown>).__lsReentry = reentryCount;
        }
        return $t(phrase, category);
    }

    let { children }: { children: Snippet } = $props();

    const TESTS = [
        { href: '/e2e', label: 'Overview' },
        { href: '/e2e/lanes', label: 'Lanes & grant' },
        { href: '/e2e/hydration', label: 'Hydration' },
        { href: '/e2e/visibility', label: 'Visibility' },
        { href: '/e2e/nav', label: 'Navigation' },
        { href: '/e2e/grant', label: 'Grant' },
        { href: '/e2e/params', label: 'Params' },
        { href: '/e2e/vanilla', label: 'Vanilla vs Svelte' },
    ];

    // `/e2e/ssr-write` is deliberately NOT listed. It is one half of a two-case
    // procedure that requires a freshly started server per case: `LangsysApp` is a
    // process-wide singleton, so the first `init()` in a process wins for every
    // later request — including requests for other routes. A nav link would invite
    // clicking into it mid-session, silently contaminating both it and whatever ran
    // before. See _dev_/e2e/README.md.
</script>

<div class="wrap">
    <header>
        <strong>Langsys 838 · Svelte E2E</strong>
        <!--
            `data-sveltekit-reload` makes the overview's stated invariant true by
            construction: every lane switch is a full page load, never a client-side
            navigation. Without it these are ordinary SvelteKit navigations, the app
            never remounts, and switching to a lane with a different init signature
            trips the guard in `initLangsys` and renders "Init failed" — which reads
            as a broken testbed rather than as the singleton doing exactly what it
            documents. The in-page links under /e2e/nav must NOT carry this: those
            navigations are the thing under test.
        -->
        <nav data-sveltekit-reload>
            {#each TESTS as tst (tst.href)}
                <a href={tst.href} class:active={page.url.pathname === tst.href}>{tst.label}</a>
            {/each}
        </nav>
    </header>
    <!-- Rendered in the LAYOUT, so it survives client-side navigation without remounting. -->
    <p class="mono muted" data-testid="layout-phrase">{countedT('E2E 838 · layout · persistent phrase', 'E2E838')}</p>
    {@render children()}
</div>

<style>
    :global(body) {
        margin: 0;
        font-family: ui-sans-serif, system-ui, sans-serif;
        line-height: 1.5;
    }
    .wrap {
        max-width: 62rem;
        margin: 0 auto;
        padding: 1rem 1.25rem 4rem;
    }
    header {
        display: flex;
        gap: 1rem;
        align-items: baseline;
        flex-wrap: wrap;
        padding: 0.75rem 0 1rem;
        border-bottom: 1px solid #ddd;
        margin-bottom: 1.5rem;
    }
    nav {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
    }
    nav a {
        color: #0645ad;
        text-decoration: none;
        font-size: 0.9rem;
    }
    nav a.active {
        font-weight: 700;
        text-decoration: underline;
    }
    :global(.card) {
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 1rem;
        margin: 1rem 0;
    }
    :global(.mono) {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.85rem;
    }
    :global(.muted) {
        color: #666;
    }
    :global(.expect) {
        background: #f6f8fa;
        border-left: 3px solid #0645ad;
        padding: 0.6rem 0.9rem;
        margin: 0.75rem 0;
        font-size: 0.9rem;
    }
    :global(button) {
        font: inherit;
        padding: 0.35rem 0.7rem;
        border: 1px solid #999;
        border-radius: 4px;
        background: #fff;
        cursor: pointer;
    }
</style>
