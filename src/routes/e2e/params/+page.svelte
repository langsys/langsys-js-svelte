<script lang="ts">
    /**
     * Interpolation and rich-text params — the path the base SDK's v0.4.2/0.4.3
     * work touches (`interpolate.ts`, `phrase.ts`, `translate.ts`, and the new
     * `findUnusedParamKeys` warning).
     *
     * Runs on the READ key deliberately: interpolation happens against the source
     * phrase whether or not a translation exists, so nothing here needs to
     * register, and the catalog stays free of param fixtures.
     *
     * `%name%` rather than `{name}` in markup — Svelte would treat `{name}` as its
     * own expression tag and substitute before Langsys ever saw the text.
     */
    import { onMount } from 'svelte';
    import { Phrase, Translate, t } from '$lib/index.js';
    import { CATEGORY, initLangsys } from '../harness.js';

    let ready = $state(false);
    let error = $state<string | null>(null);

    let personName = $state('Sarah');
    let messageCount = $state(3);

    onMount(async () => {
        try {
            await initLangsys({ keyName: 'read' });
            ready = true;
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
    });
</script>

<h1>Params &amp; interpolation</h1>

{#if error}
    <div class="card" style="border-color:#c00"><p class="mono">{error}</p></div>
{:else if !ready}
    <p>Initializing…</p>
{:else}
    <div class="card">
        <h2>1 — <code>&lt;Translate params&gt;</code></h2>
        <Translate category={CATEGORY} params={{ name: personName, count: messageCount }}>
            <p data-testid="tr-params">Welcome back, %name%. You have %count% new messages.</p>
        </Translate>
        <p>
            <input id="pname" bind:value={personName} />
            <button onclick={() => (messageCount += 1)}>add message</button>
        </p>
        <div class="expect">
            Both placeholders substitute, and editing either input re-renders through
            <code>setParams()</code>. A literal <code>%</code> in prose must survive untouched.
        </div>
    </div>

    <div class="card">
        <h2>2 — <code>&lt;Phrase params&gt;</code> with inline markup</h2>
        <Phrase category={CATEGORY} params={{ n: messageCount }}>
            <p data-testid="phrase-params">Based on %n% <strong>reviews</strong> this week</p>
        </Phrase>
        <div class="expect">
            The markup-bearing run stays ONE translatable phrase; the <code>&lt;strong&gt;</code>
            is tokenized out and reconstituted at render, so the translator never sees it.
        </div>
    </div>

    <div class="card">
        <h2>3 — unknown placeholder, no matching param</h2>
        <Translate category={CATEGORY} params={{ name: personName }}>
            <p data-testid="tr-unknown">Hello %name%, your code is %missing%.</p>
        </Translate>
        <div class="expect">
            Documented behavior: an unknown key stays visible in canonical form
            (<code>&lbrace;missing&rbrace;</code>) rather than blanking — matching
            <code>$t()</code>.
        </div>
    </div>

    <div class="card">
        <h2>4 — unused param, no matching placeholder</h2>
        <Translate category={CATEGORY} params={{ name: personName, unusedKey: 'x' }}>
            <p data-testid="tr-unused">Only %name% appears here.</p>
        </Translate>
        <div class="expect">
            The inverse of case 3, and what <code>findUnusedParamKeys</code> exists for: a param
            supplied with nowhere to go should produce a debug warning naming
            <code>unusedKey</code>, not silence. Rendering must be unaffected.
        </div>
    </div>

    <div class="card">
        <h2>5 — literal percent in prose</h2>
        <p data-testid="t-percent">{$t('Save 50% today — width: 100% supported', CATEGORY)}</p>
        <div class="expect">
            Only <code>%identifier%</code> is matched, so bare percentages in copy must pass
            through unchanged.
        </div>
    </div>
{/if}
