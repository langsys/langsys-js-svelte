<script lang="ts">
    import { t } from '$lib/index.js';
    import { CATEGORY, phrase } from '../harness.js';

    let { data } = $props();
</script>

<h1>SSR write lane</h1>

{#if data.initError}
    <div class="card" style="border-color:#c00">
        <strong style="color:#c00">Init failed in load</strong>
        <p class="mono">{data.initError}</p>
    </div>
{/if}

<div class="expect">
    <code>ssrTokenStrategy: 'server'</code> · key <code>ip_write</code> · grant
    <strong>{data.withGrant ? 'configured' : 'none'}</strong> · run <strong>{data.run}</strong>
    <br /><br />
    Registration here originates from the <strong>Node process</strong>, so the API sees the origin server's IP — not a visitor's. Under IP gating that is a
    different trust position entirely: the customer's own server IP must be allow-listed or every server-strategy registration is silently refused. This dev
    server is loopback, so it exercises the allow-listed case.
</div>

<div class="card">
    <h2>Phrases missed during server render</h2>
    <p>{$t(phrase('ssr-write', 1, data.run), CATEGORY)}</p>
    <p>{$t(phrase('ssr-write', 2, data.run), CATEGORY)}</p>
    <div class="expect">
        {#if data.withGrant}
            A grant is configured, so <code>'server'</code>
            <strong
                >degrades to
                <code>'client'</code></strong
            >
            and warns at init. A grant makes write capability per-user, while the SSR lane can only hold one process-wide decision — writing from the server would
            apply one user's capability to every later visitor in that process. These must <strong>not</strong> be registered by the server.
        {:else}
            No grant, so the server flushes registrations itself. These must reach the catalog from the server process, with no browser involved.
        {/if}
    </div>
</div>
