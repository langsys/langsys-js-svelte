<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { LangsysApp, t, writeEnabled, Translate } from '$lib/index.js';
    import { CATEGORY, DEFAULT_RUN, KEYS, isKeyName, initLangsys, phrase } from '../harness.js';

    const keyName = $derived(isKeyName(page.url.searchParams.get('key')) ? (page.url.searchParams.get('key') as 'read' | 'ip_write' | 'write') : 'read');
    const run = $derived(page.url.searchParams.get('run') ?? DEFAULT_RUN);

    let status = $state<'idle' | 'ready' | 'error'>('idle');
    let error = $state<string | null>(null);

    // Rendered only after the grant lands — these are the misses that must
    // register directly, as opposed to the ones above that predate it.
    let postGrant = $state(false);
    let grantState = $state<'none' | 'setting' | 'set' | 'failed'>('none');

    onMount(async () => {
        try {
            await initLangsys({ keyName });
            status = 'ready';
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            status = 'error';
        }
    });

    async function applyGrant() {
        grantState = 'setting';
        try {
            // The `write` key's grant stands in for a real login-minted JWT: the
            // point under test is that setWriteGrant re-authorizes at all.
            await LangsysApp.setWriteGrant(KEYS.write);
            postGrant = true;
            grantState = 'set';
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            grantState = 'failed';
        }
    }
</script>

<h1>Lanes &amp; grant</h1>

<p class="mono muted">
    key <strong>{keyName}</strong> · run <strong>{run}</strong> ·
    <a href="/e2e/lanes?key=read&run={run}">read</a> ·
    <a href="/e2e/lanes?key=ip_write&run={run}">ip_write</a> ·
    <a href="/e2e/lanes?key=write&run={run}">write</a>
</p>

<div class="expect">
    <strong>writeEnabled:</strong>
    <span class="mono">{$writeEnabled === undefined ? 'undefined (unknown)' : String($writeEnabled)}</span>
    <br />
    Expected: <code>read</code> → false · <code>ip_write</code> from loopback → true ·
    <code>write</code> → true. Never <code>false</code> as a stand-in for "not known yet".
</div>

{#if status === 'error'}
    <div class="card" style="border-color:#c00">
        <strong style="color:#c00">Init failed</strong>
        <p class="mono">{error}</p>
    </div>
{:else if status === 'idle'}
    <p>Initializing…</p>
{:else}
    <div class="card">
        <h2>Pre-grant misses</h2>
        <p>{$t(phrase('lanes', 1, run), CATEGORY)}</p>
        <p>{$t(phrase('lanes', 2, run), CATEGORY)}</p>
        <Translate category={CATEGORY}>
            <p>{phrase('lanes', 3, run)}</p>
        </Translate>
        <div class="expect">
            With a write-enabled session these register directly. With a read-only session they
            register nothing — the page is reported via the hint lane and our renderer registers
            them instead.
        </div>
    </div>

    <div class="card">
        <h2>Grant</h2>
        <p>
            <button onclick={applyGrant} disabled={grantState === 'setting' || grantState === 'set'}>
                {grantState === 'set' ? 'Grant applied' : 'Apply write grant'}
            </button>
            <span class="mono muted">{grantState}</span>
        </p>
        <div class="expect">
            <code>setWriteGrant()</code> re-authorizes, so <code>writeEnabled</code> above should
            flip to <code>true</code>. The pre-grant misses are <em>not</em> expected to flush —
            they were released when authorization came back read-only, and reach the backend via
            the hint lane instead.
        </div>
        {#if postGrant}
            <h3>Post-grant misses</h3>
            <p>{$t(phrase('lanes-post-grant', 1, run), CATEGORY)}</p>
            <p>{$t(phrase('lanes-post-grant', 2, run), CATEGORY)}</p>
            <div class="expect">These must register directly, whatever the key's own level was.</div>
        {/if}
    </div>
{/if}
