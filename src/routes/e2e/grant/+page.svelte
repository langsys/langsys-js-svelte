<script lang="ts">
    /**
     * Grant lane, driven through the SVELTE STORE form of `writeGrant` — the one
     * piece of surface that exists only in this binding — and through the binding's
     * own `setWriteGrant` override.
     *
     * The store is passed straight to `init()`; `adaptWriteGrant` turns it into a
     * provider function rather than a snapshot, so the base SDK resolves it fresh
     * on every request. Writing a new token to the store therefore takes effect on
     * the next request with no imperative call, which is the whole reason the
     * callback form exists — a static string is stale the moment the JWT expires.
     *
     * Deliberately uses the READ key: a read key WITH a valid grant is
     * write-enabled and the same key without one is not, so a flip here proves
     * the grant arm did the work rather than the key type.
     */
    import { onMount } from 'svelte';
    import { writable } from 'svelte/store';
    import { page } from '$app/state';
    import { LangsysApp, t, writeEnabled } from '$lib/index.js';
    import { BASE_URL, CATEGORY, DEFAULT_RUN, KEYS, PROJECT_ID, phrase, userLocale } from '../harness.js';

    const run = $derived(page.url.searchParams.get('run') ?? DEFAULT_RUN);
    const initial = $derived(page.url.searchParams.get('initial') ?? '');
    const next = $derived(page.url.searchParams.get('next') ?? '');

    const grantStore = writable<string>('');

    let ready = $state(false);
    let error = $state<string | null>(null);
    let busy = $state(false);
    let log = $state<string[]>([]);
    let showPostGrant = $state(false);

    const note = (m: string) => (log = [...log, m]);

    onMount(async () => {
        grantStore.set(page.url.searchParams.get('initial') ?? '');
        try {
            await LangsysApp.init({
                projectid: PROJECT_ID,
                key: KEYS.read,
                UserLocaleStore: userLocale,
                baseLocale: 'en-US',
                debug: true,
                // The seam the README documents, not `LangsysAppAPI.setBaseUrl()` —
                // using it here is what proves it survives this binding's `init` override.
                apiUrl: BASE_URL,
                writeGrant: grantStore,
            });
            ready = true;
            note(`init with store token: ${initial ? initial.slice(0, 18) + '…' : '(empty)'}`);
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
    });

    /** Write a new token into the store, then re-derive via a catalog fetch. */
    async function swapAndRefresh() {
        busy = true;
        grantStore.set(next);
        note(`store set to: ${next ? next.slice(0, 18) + '…' : '(empty)'}`);
        await LangsysApp.refresh();
        note('refresh() complete — writeEnabled re-derived from the store');
        showPostGrant = true;
        busy = false;
    }

    /**
     * The imperative path, through the binding's `setWriteGrant` override. It must
     * RE-AUTHORIZE: capability is the server's decision, so the flip has to arrive in
     * the authorization response rather than from config written on this side.
     */
    async function setGrantImperatively() {
        busy = true;
        await LangsysApp.setWriteGrant(next);
        note(`setWriteGrant(${next ? next.slice(0, 18) + '…' : '(empty)'}) resolved`);
        showPostGrant = true;
        busy = false;
    }
</script>

<h1>Grant (store form)</h1>

<div class="expect">
    <strong>writeEnabled:</strong>
    <span class="mono" data-testid="we">
        {$writeEnabled === undefined ? 'undefined' : String($writeEnabled)}
    </span>
    · key <strong>read</strong>
</div>

{#if error}
    <div class="card" style="border-color:#c00"><p class="mono">{error}</p></div>
{:else if !ready}
    <p>Initializing…</p>
{:else}
    <div class="card">
        <h2>Store read-through</h2>
        <button onclick={swapAndRefresh} disabled={busy || !next}> Set next token into store, then refresh() </button>
        <ul class="mono">
            {#each log as line (line)}<li>{line}</li>{/each}
        </ul>
        <div class="expect">
            No imperative <code>setWriteGrant()</code> here — the store is written and the value is picked up on the next request. That is what a static string could
            not do.
        </div>
    </div>

    <div class="card">
        <h2>Imperative <code>setWriteGrant()</code></h2>
        <button onclick={setGrantImperatively} disabled={busy || !next}>setWriteGrant(next)</button>
        <div class="expect">
            Open with no <code>?initial=</code>, so the read key starts read-only. The call must re-authorize: the flip above has to come from the server's
            answer, and misses rendered after it register directly.
        </div>
    </div>

    {#if showPostGrant}
        <div class="card">
            <h2>Post-grant misses</h2>
            <p>{$t(phrase('grant-store', 1, run), CATEGORY)}</p>
            <p>{$t(phrase('grant-store', 2, run), CATEGORY)}</p>
            <div class="expect">
                Rendered after the grant changed. They register directly only if the server now says the session is write-enabled — a valid grant, not an
                expired one.
            </div>
        </div>
    {/if}
{/if}
