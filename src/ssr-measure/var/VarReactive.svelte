<script lang="ts">
    /**
     * Fixture for `/e2e/reactivity-var`, compiled WITH the transform (see `varTransform` in
     * vite.config.ts): the cases of `/e2e/reactivity`, which is compiled without it, each value a
     * placeholder. Once a block is translated, a changed value must show in the translation.
     */
    import { Phrase, Translate } from '$lib/index.js';

    let { name, label }: { name: string; label: string } = $props();
</script>

<div id="phrase"><Phrase category="RXV" tag="p">Hello {name}</Phrase></div>
<div id="block"><Translate category="RXV" tag="div"><p>Hello {name}</p></Translate></div>
<div id="option">
    <Translate category="RXV" tag="div"
        ><p>Choose one</p>
        <select><option>Pick {label}</option></select></Translate
    >
</div>
