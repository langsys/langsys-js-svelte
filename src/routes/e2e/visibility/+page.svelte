<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { t } from '$lib/index.js';
    import { CATEGORY, DEFAULT_RUN, initLangsys, phrase } from '../harness.js';

    const run = $derived(page.url.searchParams.get('run') ?? DEFAULT_RUN);

    let ready = $state(false);
    let error = $state<string | null>(null);

    // Shape 1 — present in the DOM, hidden by CSS.
    let cssHidden = $state(true);
    // Shape 2 — never mounted until the flag flips.
    let ifOpen = $state(false);
    // Shape 3 — never mounted until the promise settles.
    let deferred = $state<Promise<string> | null>(null);

    onMount(async () => {
        try {
            await initLangsys({ keyName: 'ip_write' });
            ready = true;
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
    });

    function resolveDeferred() {
        deferred = new Promise((res) => setTimeout(() => res('resolved'), 1200));
    }
</script>

<h1>Visibility</h1>

<div class="expect">
    The discovery line is <strong>mounted vs. conditionally rendered</strong>, not hidden vs.
    visible. A node that exists but is invisible still has <code>t()</code> run and its DOM walked,
    so it registers. A node that was never mounted is invisible to discovery — the renderer's
    session never creates it.
</div>

{#if error}
    <div class="card" style="border-color:#c00"><p class="mono">{error}</p></div>
{:else if !ready}
    <p>Initializing…</p>
{:else}
    <div class="card">
        <h2>1 — CSS-hidden (expected: DISCOVERED)</h2>
        <button onclick={() => (cssHidden = !cssHidden)}>
            {cssHidden ? 'Reveal' : 'Hide'}
        </button>
        <div style:display={cssHidden ? 'none' : 'block'}>
            <p>{$t(phrase('visibility-css-hidden', 1, run), CATEGORY)}</p>
        </div>
        <div class="expect">
            Mounted from first render regardless of the toggle, so it registers without anyone
            clicking anything.
        </div>
    </div>

    <div class="card">
        <h2>2 — <code>{'{#if}'}</code> (expected: NOT discovered)</h2>
        <button onclick={() => (ifOpen = !ifOpen)}>{ifOpen ? 'Close' : 'Open'}</button>
        {#if ifOpen}
            <p>{$t(phrase('visibility-if-block', 1, run), CATEGORY)}</p>
        {/if}
        <div class="expect">
            Never mounts in the renderer's session, so it is a genuine blind spot. It should appear
            only after a human opens it here.
        </div>
    </div>

    <div class="card">
        <h2>3 — <code>{'{#await}'}</code> pending (expected: NOT discovered)</h2>
        <button onclick={resolveDeferred} disabled={deferred !== null}>Start deferred load</button>
        {#if deferred}
            {#await deferred}
                <p class="muted">Loading…</p>
            {:then}
                <p>{$t(phrase('visibility-await-block', 1, run), CATEGORY)}</p>
            {/await}
        {/if}
        <div class="expect">
            The dangerous one. A pending branch has never mounted, so it behaves exactly like
            <code>{'{#if}'}</code> — but nothing about the markup <em>looks</em> conditional, and
            this is the idiomatic SvelteKit shape for streamed <code>load</code> data. A customer
            streaming below-the-fold content is silently undiscoverable.
        </div>
    </div>
{/if}
