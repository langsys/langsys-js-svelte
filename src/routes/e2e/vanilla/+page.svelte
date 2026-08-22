<script lang="ts">
    /**
     * Isolates the core `Translate` class from this package's Svelte wrapper.
     *
     * Same page, same session, two hosts with identical inner markup: one mounted
     * by the Svelte `<Translate>` component, one by constructing the vanilla class
     * directly on a hand-built element. If both lose the inner `<p>`, the
     * behaviour is the core tokenizer's; if only the Svelte one does, it's ours.
     */
    import { onMount } from 'svelte';
    import { Translate as VanillaTranslate } from 'langsys-js-typescript';
    import { Translate } from '$lib/index.js';
    import { CATEGORY, initLangsys } from '../harness.js';

    // NOTE: do not name a variable in a .svelte file `svelteHTML`. svelte2tsx
    // generates `svelteHTML.createElement(...)` for every element in the
    // template, so a local of that name shadows the generated namespace and the
    // file fills with `Property 'createElement' does not exist on type 'string'`
    // on every markup line — pointing at the template while the cause is in the
    // script. Cost an hour here; the state below is `svelteOut` for that reason.

    let vanillaHost = $state<HTMLElement>();
    let ready = $state(false);
    let svelteOut = $state('');
    let vanillaHTML = $state('');

    onMount(async () => {
        await initLangsys({ keyName: 'read' });
        ready = true;

        // Build the vanilla host's children by hand so Svelte never renders them.
        await new Promise((r) => setTimeout(r, 300));
        if (vanillaHost) {
            vanillaHost.innerHTML = '<p data-testid="vanilla-inner">Vanilla host paragraph with an attribute</p>';
            new VanillaTranslate(vanillaHost, { category: CATEGORY, custom_id: '', label: '' });
        }

        await new Promise((r) => setTimeout(r, 1200));
        svelteOut = document.querySelector('[data-probe="svelte"]')?.outerHTML ?? '(none)';
        vanillaHTML = vanillaHost?.outerHTML ?? '(none)';
    });
</script>

<h1>Vanilla vs Svelte &lt;Translate&gt;</h1>

{#if !ready}
    <p>Initializing…</p>
{:else}
    <div class="card">
        <h2>A — Svelte <code>&lt;Translate&gt;</code> component</h2>
        <div data-probe="svelte">
            <Translate category={CATEGORY}>
                <p data-testid="svelte-inner">Svelte host paragraph with an attribute</p>
            </Translate>
        </div>
    </div>

    <div class="card">
        <h2>B — vanilla <code>Translate</code> class, children built by hand</h2>
        <!-- A plain <div> host, not a literal <translate> tag: svelte-check resolves
             an unknown <translate> element against the global `translate` typing and
             floods the file with bogus errors. The vanilla class accepts any host. -->
        <div bind:this={vanillaHost}></div>
    </div>

    <div class="card">
        <h2>Rendered DOM</h2>
        <p class="mono" data-testid="out-svelte">A: {svelteOut}</p>
        <p class="mono" data-testid="out-vanilla">B: {vanillaHTML}</p>
    </div>
{/if}
