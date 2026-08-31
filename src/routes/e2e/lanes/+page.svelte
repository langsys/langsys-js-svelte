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
            // Deliberately NOT a valid grant. An API key is not a JWT and the server
            // refuses it, so this exercises the MECHANISM — that `setWriteGrant`
            // re-authorizes at all and sends `X-Write-Grant` — and nothing more.
            // `writeEnabled` will stay false. For the accepted-grant path, which
            // needs a real signed JWT, use /e2e/grant.
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
    <!--
        Painted separately and bare, so a capability assertion can read what the USER sees
        rather than what a store holds. A binding can carry a correct signal and still fail
        to paint it; a suite that only reads stores cannot tell the two apart.
    -->
    <span class="mono" data-testid="we-rendered">{String($writeEnabled)}</span>
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
            With a write-enabled session these register directly. With a read-only session they register nothing — the page is reported via the hint lane and
            our renderer registers them instead.
        </div>
    </div>

    <div class="card">
        <h2>Grant</h2>
        <p>
            <button onclick={applyGrant} disabled={grantState === 'setting' || grantState === 'set'}>
                {grantState === 'set' ? 'Grant sent (rejected)' : 'Send an invalid grant'}
            </button>
            <span class="mono muted">{grantState}</span>
        </p>
        <div class="expect">
            <strong>This button sends a deliberately invalid grant</strong> — an API key, not a signed JWT — so the server refuses it and
            <code>writeEnabled</code>
            above stays
            <code>false</code>. That is the expected result here, not a failure.
            <br /><br />
            What it proves is the <em>mechanism</em>: <code>setWriteGrant()</code> re-authorizes rather than only writing config, and the re-auth request
            carries
            <code>X-Write-Grant</code>. That mechanism was inert once, so it is worth exercising on its own.
            <br /><br />
            For the accepted path — a valid grant flipping a read key to write-enabled, and misses after it registering directly — see
            <a href="/e2e/grant">/e2e/grant</a>, which takes real signed JWTs via <code>?initial=</code> / <code>?next=</code>. Minting one here would put the
            signing secret in page code, which is exactly what it must never be.
        </div>
        {#if postGrant}
            <h3>Post-grant misses</h3>
            <p>{$t(phrase('lanes-post-grant', 1, run), CATEGORY)}</p>
            <p>{$t(phrase('lanes-post-grant', 2, run), CATEGORY)}</p>
            <div class="expect">
                These must <strong>not</strong> register: the grant was refused, so the session is still read-only and they belong to the hint lane. Confirmed by
                their absence from the catalog after a run.
            </div>
        {/if}
    </div>
{/if}
