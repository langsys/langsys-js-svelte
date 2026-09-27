<script lang="ts">
    /**
     * What Svelte's hydration does to text it did not render — the facts the server-rendered block
     * path is built on. `hooks.server.ts` rewrites this page's text in the served HTML (standing in
     * for a server-translated block), and `_dev_/e2e/svelte-dom.mjs` reads the DOM after hydration.
     */
    import Nested from './Nested.svelte';

    let greeting = $state('Welcome');
    let clicks = $state(0);
    const where = typeof window === 'undefined' ? 'server' : 'client';
    if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__hydration = { setGreeting: (g: string) => (greeting = g) };
</script>

<div data-testid="host">
    <p data-testid="static">Hello friend</p>
    <p data-testid="expr">{greeting}</p>
    <Nested />
    <button data-testid="btn" onclick={() => clicks++}>Click me</button>
    <p data-testid="where">{where}</p>
</div>
<p data-testid="clicks">{clicks}</p>
