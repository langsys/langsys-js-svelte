<script lang="ts">
    import { BASE_URL, PROJECT_ID, missingEnv } from './harness.js';

    const missing = missingEnv();
</script>

<h1>Ticket 838 — write-key gating & content discovery</h1>

{#if missing.length}
    <div class="card" style="border-color:#c00">
        <strong style="color:#c00">Missing environment</strong>
        <p class="mono">{missing.join(', ')}</p>
        <p>Copy <code>.env.example</code> to <code>.env</code> and fill these in.</p>
    </div>
{:else}
    <p class="mono muted">API {BASE_URL} · project {PROJECT_ID}</p>
{/if}

<div class="expect">
    Every lane switch is a <strong>full page load</strong>, never a client-side navigation.
    <code>LangsysApp</code> is a module-scope singleton, so a second <code>init()</code> in the same document is not a clean slate.
</div>

<div class="card">
    <h2>Lanes &amp; grant</h2>
    <p>
        Read-only key registers nothing (page reported via the hint lane instead); write-enabled key registers directly. The grant path re-authorizes so the
        server re-evaluates the session.
    </p>
    <p class="mono">
        <a href="/e2e/lanes?key=read">?key=read</a> ·
        <a href="/e2e/lanes?key=ip_write">?key=ip_write</a> ·
        <a href="/e2e/lanes?key=write">?key=write</a>
    </p>
    <div class="expect">
        Grant expectation is <em>misses after the grant is set register directly; earlier ones arrive via the hint lane</em> — not "held misses flush". With no
        grant at <code>init()</code>
        the queue is released on a read-only answer and later misses aren't collected, so there is nothing held to flush by the time the grant lands.
    </div>
</div>

<div class="card">
    <h2>Hydration</h2>
    <p>
        <code>await LangsysApp.init(...)</code> in a universal <code>+page.ts</code> load. SvelteKit awaits universal load before mounting, so authorization has
        resolved before the first client render — the one path that reaches a <code>writeEnabled</code> hydration mismatch.
    </p>
</div>

<div class="card">
    <h2>Visibility</h2>
    <p>
        The discovery line is <strong>mounted vs. conditionally rendered</strong>, not hidden vs. visible. Three shapes, one of which looks nothing like a
        conditional.
    </p>
</div>

<div class="card">
    <h2>Navigation</h2>
    <p>
        Client-side navigation and shallow routing (<code>pushState</code>) during the hint's 5–30s jitter. Neither remounts the app, so a URL read at fire time
        would be the wrong page.
    </p>
</div>
