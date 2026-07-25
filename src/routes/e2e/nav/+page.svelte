<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { pushState, replaceState } from '$app/navigation';
    import { t } from '$lib/index.js';
    import { CATEGORY, DEFAULT_RUN, initLangsys, phrase } from '../harness.js';

    const run = $derived(page.url.searchParams.get('run') ?? DEFAULT_RUN);

    let ready = $state(false);
    let error = $state<string | null>(null);
    let mountedAt = $state('');
    let hrefNow = $state('');

    onMount(async () => {
        mountedAt = window.location.href;
        try {
            await initLangsys({ keyName: 'read' });
            ready = true;
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
    });

    // Separate from onMount: an async onMount can't return a cleanup function.
    $effect(() => {
        hrefNow = window.location.href;
        const tick = setInterval(() => (hrefNow = window.location.href), 250);
        return () => clearInterval(tick);
    });
</script>

<h1>Navigation</h1>

<div class="expect">
    Neither client-side navigation nor shallow routing remounts the app or resets module state. The
    hint waits 5–30s before firing, so a URL read at <em>fire</em> time is whatever page the user
    wandered to — not the page the miss happened on. URL is captured at <strong>miss</strong> time,
    which is what makes both cases below correct by construction.
</div>

{#if error}
    <div class="card" style="border-color:#c00"><p class="mono">{error}</p></div>
{:else if !ready}
    <p>Initializing…</p>
{:else}
    <div class="card">
        <h2>Misses on this URL</h2>
        <p>{$t(phrase('nav-origin', 1, run), CATEGORY)}</p>
        <p>{$t(phrase('nav-origin', 2, run), CATEGORY)}</p>
        <p class="mono muted">
            captured at mount: {mountedAt}<br />
            location right now: {hrefNow}
        </p>
        <div class="expect">
            Read-only key, so these go to the hint lane. The hint for these phrases must name
            <strong>this</strong> URL — <code>/e2e/nav</code> — no matter where you are when the
            timer fires.
        </div>
    </div>

    <div class="card">
        <h2>1 — Client-side navigation</h2>
        <p>
            Click through within the jitter window. The app does not remount, so a fire-time read
            would report the destination.
        </p>
        <p class="mono"><a href="/e2e/nav/elsewhere?run={run}">→ /e2e/nav/elsewhere</a></p>
    </div>

    <div class="card">
        <h2>2 — Shallow routing</h2>
        <p>
            <code>pushState</code>/<code>replaceState</code> mutate <code>location.href</code> with
            no navigation event at all — the purest test of miss-time capture, since there is no
            navigation for a fix to hang off.
        </p>
        <button onclick={() => pushState('?shallow=pushed', {})}>pushState</button>
        <button onclick={() => replaceState('?shallow=replaced', {})}>replaceState</button>
        <div class="expect">
            Both change the URL above while the pending hint keeps its captured one. The hint must
            still name the URL as it was at miss time, without the shallow query string.
        </div>
    </div>
{/if}
