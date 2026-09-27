<script lang="ts">
    /**
     * Reactive content inside translated blocks — a regression guard for the core writing
     * translated text into the nodes Svelte already holds, never replacing them. A replaced node
     * leaves Svelte updating a detached one, and the page freezes on its first translation.
     * Driven by `_dev_/e2e/svelte-dom.mjs`.
     */
    import { LangsysApp, Phrase, Translate } from '$lib/index.js';
    import { generateCustomId, tokenizeElement, type iCategories } from 'langsys-js-typescript';

    let name = $state('Sarah');
    let label = $state('Alpha');

    (window as unknown as Record<string, unknown>).__reactivity = {
        change: () => {
            name = 'Bob';
            label = 'Beta';
        },
        blocks: () =>
            [...document.querySelectorAll('[data-block] > *')].map((host) => {
                const { tokens } = tokenizeElement(host as HTMLElement);
                return { id: generateCustomId('RX', tokens), tokens };
            }),
        seed: (catalog: iCategories) => LangsysApp.seedCatalog(catalog, 'en-us'),
    };
</script>

<!-- <Phrase> wrapping an expression, and its in-place control under <Translate>. -->
<div id="phrase"><Phrase category="RX" tag="p">Hello {name}</Phrase></div>
<div id="phrase-control" data-block><Translate category="RX" tag="div"><p>Hello {name}</p></Translate></div>

<!-- An <option> in a two-token block — the path that runs the select branch — and its in-place control. -->
<div id="option" data-block>
    <Translate category="RX" tag="div"
        ><p>Choose one</p>
        <select><option>Pick {label}</option></select></Translate
    >
</div>
<div id="option-control" data-block>
    <Translate category="RX" tag="div"
        ><p>Choose one</p>
        <p>Pick {label}</p></Translate
    >
</div>
