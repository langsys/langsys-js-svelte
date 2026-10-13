<script lang="ts">
    /**
     * The README's fallback-block table, measured: `<Translate>` blocks WITHOUT the transform (this
     * route is outside `varTransform`), each with content Svelte changes after translation.
     * Driven by `_dev_/e2e/freeze.mjs`.
     */
    import { writable } from 'svelte/store';
    import { Translate } from '$lib/index.js';

    let flag = $state(true);
    let msg = $state('First message');
    const msgStore = writable('First message');
    const flagStore = writable(true);
    let loading = $state(new Promise<string>((r) => setTimeout(() => r('Loaded text'), 1000)));

    (globalThis as unknown as { __freeze: () => void }).__freeze = () => {
        flag = false;
        msg = 'Second message';
        msgStore.set('Second message');
        flagStore.set(false);
    };
</script>

<Translate category="FRZ" tag="div"
    ><p id="if">
        {#if flag}Branch one{:else}Branch two{/if}
    </p></Translate
>
<Translate category="FRZ" tag="div"><p id="expr">{msg}</p></Translate>
<Translate category="FRZ" tag="div"><p id="store-expr">{$msgStore}</p></Translate>
<Translate category="FRZ" tag="div"
    ><p id="store-if">
        {#if $flagStore}Branch one{:else}Branch two{/if}
    </p></Translate
>
<Translate category="FRZ" tag="div"><p id="await">{#await loading}Waiting{:then v}{v}{/await}</p></Translate>
<Translate category="FRZ" tag="div"
    ><p id="two">Fixed text</p>
    <p id="two-expr">{msg}</p></Translate
>
