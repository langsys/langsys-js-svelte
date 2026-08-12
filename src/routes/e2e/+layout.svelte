<script lang="ts">
    import type { Snippet } from 'svelte';
    import { page } from '$app/state';

    let { children }: { children: Snippet } = $props();

    const TESTS = [
        { href: '/e2e', label: 'Overview' },
        { href: '/e2e/lanes', label: 'Lanes & grant' },
        { href: '/e2e/hydration', label: 'Hydration' },
        { href: '/e2e/visibility', label: 'Visibility' },
        { href: '/e2e/nav', label: 'Navigation' },
        { href: '/e2e/grant', label: 'Grant' },
        { href: '/e2e/params', label: 'Params' },
    ];
</script>

<div class="wrap">
    <header>
        <strong>Langsys 838 · Svelte E2E</strong>
        <nav>
            {#each TESTS as tst (tst.href)}
                <a href={tst.href} class:active={page.url.pathname === tst.href}>{tst.label}</a>
            {/each}
        </nav>
    </header>
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
