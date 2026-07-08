<script lang="ts">
    import { writable } from 'svelte/store';
    import { onMount } from 'svelte';
    import { LangsysApp, t, currentlyLoadedLocale, Translate } from '$lib/index.js';

    const userLocale = writable('en-US');
    let ready = $state(false);
    let error = $state<string | null>(null);

    // Live params for the <Translate params> demo below — editing these
    // re-renders the content block via the underlying setParams().
    let personName = $state('Sarah');
    let messageCount = $state(3);

    const LOCALES = [
        { code: 'en-US', label: 'English (US)' },
        { code: 'es-ES', label: 'Español' },
        { code: 'fr-FR', label: 'Français' },
        { code: 'de-DE', label: 'Deutsch' },
    ];

    onMount(async () => {
        const projectid = import.meta.env.VITE_LANGSYS_PROJECT_ID;
        const key = import.meta.env.VITE_LANGSYS_API_KEY;
        if (!projectid || !key) {
            error = 'Missing VITE_LANGSYS_PROJECT_ID or VITE_LANGSYS_API_KEY in .env';
            return;
        }
        const res = await LangsysApp.init({
            projectid,
            key,
            UserLocaleStore: userLocale,
            baseLocale: 'en-US',
            debug: true,
        });
        if (res?.status === false) {
            error = res.errors?.join(', ') ?? 'Init failed';
        } else {
            ready = true;
        }
    });
</script>

{#if error}
    <main>
        <h1 style="color: #c00">Langsys init failed</h1>
        <p style="font-family: monospace">{error}</p>
        <p>
            Copy <code>.env.example</code> to <code>.env</code>, fill in your project ID + API key,
            and restart <code>npm run dev</code>.
        </p>
    </main>
{:else if !ready}
    <main><p>Loading Langsys…</p></main>
{:else}
    <main>
        <h1>{$t('Welcome to the Langsys + Svelte demo', 'Demo')}</h1>
        <p>{$t('Pick a locale below — translations update everywhere.', 'Demo')}</p>

        <div class="row">
            <label for="locale">{$t('Locale', 'UI')}:</label>
            <select id="locale" bind:value={$userLocale}>
                {#each LOCALES as l (l.code)}
                    <option value={l.code}>{l.label}</option>
                {/each}
            </select>
        </div>

        <section class="card">
            <h2>{$t('Direct phrase translation', 'Demo')}</h2>
            <p>
                {$t(
                    'Each phrase in your code is its own token. The first render registers the phrase with the Translation Manager; subsequent locale changes fetch and re-render automatically.',
                    'Demo',
                )}
            </p>
        </section>

        <section class="card">
            <h2>{$t('Interpolation', 'Demo')}</h2>
            <p>{$t('Hello, {name}! You have {count} new messages.', 'Greetings', { name: 'Sarah', count: 3 })}</p>
            <p class="muted">
                {$t('Placeholders in the phrase above are required and type-checked at compile time — try removing a key from the params object to see the error.', 'Demo')}
            </p>
        </section>

        <section class="card">
            <h2>{$t('Categorization disambiguates context', 'Demo')}</h2>
            <ul>
                <li>
                    <strong>{$t('Home', 'Main Menu')}</strong>
                    &nbsp;<em>{$t('(menu item)', 'Demo')}</em>
                </li>
                <li>
                    <strong>{$t('Home', 'Home repairs')}</strong>
                    &nbsp;<em>{$t('(the building)', 'Demo')}</em>
                </li>
            </ul>
        </section>

        <Translate category="Demo" label="Block demo" tag="section" class="card">
            <h2>HTML content blocks</h2>
            <p>
                Wrap richer content in <code>&lt;Translate&gt;</code> and the SDK registers the whole thing as a
                <strong>content block</strong> — translators see your styling and structure as the user sees it.
                Attribute values like <em>placeholder</em>, <em>alt</em>, <em>aria-label</em> are also harvested.
            </p>
            <p>
                <input type="text" placeholder="Type something here…" />
            </p>
        </Translate>

        <section class="card">
            <h2>{$t('Interpolation inside a content block', 'Demo')}</h2>

            <Translate
                category="Demo"
                label="Params demo"
                tag="div"
                params={{ name: personName, count: messageCount }}
            >
                <p>Welcome back, %name%. You have %count% new messages.</p>
            </Translate>

            <div class="row">
                <label for="pname">{$t('Name', 'UI')}:</label>
                <input id="pname" bind:value={personName} />
                <button onclick={() => (messageCount += 1)}>{$t('Add a message', 'UI')}</button>
            </div>

            <p class="muted">
                Write <code>%name%</code> / <code>%count%</code> — not <code>&lbrace;name&rbrace;</code> —
                inside <code>&lt;Translate&gt;</code> markup: Svelte (like JSX) would otherwise consume the
                braces before Langsys sees them. The SDK normalizes the percent form back to
                <code>&lbrace;name&rbrace;</code> at capture, so translators still work with
                <code>&lbrace;name&rbrace;</code>. Editing the name or bumping the count re-renders the block
                via <code>setParams()</code>.
            </p>
        </section>

        <p class="footer">{$t('Current locale', 'UI')}: <code>{$currentlyLoadedLocale}</code></p>
    </main>
{/if}

<style>
    main {
        font-family: system-ui, sans-serif;
        max-width: 720px;
        margin: 2rem auto;
        padding: 0 1rem;
        color: #222;
    }
    .row {
        display: flex;
        gap: 1rem;
        align-items: center;
        margin: 1rem 0;
    }
    .card {
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 1rem 1.2rem;
        margin: 1rem 0;
    }
    .muted {
        color: #666;
        font-size: 0.9rem;
    }
    .footer {
        color: #666;
        margin-top: 2rem;
    }
</style>
