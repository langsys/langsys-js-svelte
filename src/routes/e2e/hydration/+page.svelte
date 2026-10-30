<script lang="ts">
    import { writeEnabled as safeWriteEnabled, t } from '$lib/index.js';
    import { writeEnabled as rawWriteEnabled } from 'langsys-js-typescript';
    import { CATEGORY, DEFAULT_RUN, phrase } from '../harness.js';
    import { page } from '$app/state';

    let { data } = $props();

    const run = $derived(page.url.searchParams.get('run') ?? DEFAULT_RUN);

    // Snapshotted at component init — i.e. DURING the hydration pass. This is
    // the value that has to match what the server rendered.
    const rawAtInit = rawWriteEnabled.get();
    const safeAtInit = (() => {
        let seen: boolean | undefined;
        safeWriteEnabled.subscribe((v) => (seen = v))();
        return seen;
    })();
</script>

<h1>Hydration</h1>

{#if data.initError}
    <div class="card" style="border-color:#c00">
        <strong style="color:#c00">Init failed in load</strong>
        <p class="mono">{data.initError}</p>
    </div>
{/if}

<div class="expect">
    <code>await LangsysApp.init(...)</code> ran in a universal <code>+page.ts</code> load, which SvelteKit awaits before mounting. Authorization has therefore already
    resolved by the first client render.
</div>

<div class="card">
    <h2>Value at component init (the hydration pass)</h2>
    <table class="mono">
        <tbody>
            <tr>
                <td style="padding-right:1.5rem">raw <code>writeEnabled</code> (base SDK)</td>
                <td>{String(rawAtInit)}</td>
            </tr>
            <tr>
                <td style="padding-right:1.5rem">safe <code>writeEnabled</code> ($lib)</td>
                <td>{String(safeAtInit)}</td>
            </tr>
        </tbody>
    </table>
    <div class="expect">
        <strong>Pass condition:</strong> the safe store reads <code>undefined</code> at init on both server and client, so the hydrated markup matches. The raw
        signal is expected to differ between the two — <code>undefined</code> on the server, concrete on the client. That divergence is the bug this store
        exists to absorb, and it is why nothing in the app should branch on the raw signal.
        <br /><br />
        A hydration mismatch surfaces in the browser console, not on the page. Check it: a clean console is the actual result here.
    </div>
</div>

<div class="card">
    <h2>Live value (post-hydration)</h2>
    <p class="mono">
        {$safeWriteEnabled === undefined ? 'undefined (unknown)' : String($safeWriteEnabled)}
    </p>
    <div class="expect">
        Expected <code>true</code> — <code>ip_write</code> from loopback. If this stayed
        <code>undefined</code>, the deferral never handed over and the store is broken in the other direction.
    </div>
</div>

<div class="card">
    <h2>Phrases rendered through the SSR path</h2>
    <p>{$t(phrase('hydration', 1, run), CATEGORY)}</p>
    <p>{$t(phrase('hydration', 2, run), CATEGORY)}</p>
    <div class="expect">
        These miss on the server too. Default <code>ssrTokenStrategy</code> is
        <code>'client'</code>, so the server-side queue is deliberately not collected — server-side discovery requires <code>'server'</code>.
    </div>
</div>
