<script lang="ts">
    /**
     * GATE-10 — the core reads `data-ls-resolved` by walking up from the host this binding
     * hands it. Each block below sits in a different ancestor arrangement; the unmarked one is
     * the control that registers.
     */
    import { Phrase, Translate, t } from '$lib/index.js';
</script>

<div data-ls-resolved="it-it">
    <Translate category="FX" tag="div"><p data-testid="g10-resolved">Resolved block <b>alpha</b> end</p></Translate>
</div>

<div data-langsys-resolved>
    <Translate category="FX" tag="div"><p>Legacy resolved block <b>beta</b> end</p></Translate>
</div>

<div data-ls-resolved>
    <section>
        <div>
            <Translate category="FX" tag="div"><p>Deep resolved block <b>gamma</b> end</p></Translate>
        </div>
    </section>
</div>

<div data-ls-resolved>
    <div data-ls-resolved="false">
        <Translate category="FX" tag="div"><p>Opted out block <b>delta</b> end</p></Translate>
    </div>
</div>

<div data-ls-resolved>
    <Phrase category="FX" tag="p">Resolved phrase with <b>markup</b></Phrase>
</div>

<!-- NEGATIVE CONTROL: a bare $t() is not a DOM reader. Its argument is source the app supplied,
     so it records its miss even under a resolved ancestor; GATE-9 is what governs t(). -->
<div data-ls-resolved>
    <p>{$t('Bare t under a resolved ancestor zeta', 'FX')}</p>
</div>

<Translate category="FX" tag="div"><p>Unmarked block <b>epsilon</b> end</p></Translate>
<Phrase category="FX" tag="p">Unmarked phrase with <b>markup</b></Phrase>
