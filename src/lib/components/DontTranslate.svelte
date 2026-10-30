<script lang="ts">
    /**
     * DontTranslate — marks a region as never-translated, preserved verbatim.
     *
     *   Built with <DontTranslate>Kangen®</DontTranslate> on
     *   <DontTranslate>langsys.dev</DontTranslate>
     *
     * `data-ls-dont-translate` is **inert** and carries no behaviour. The base SDK
     * does not know that attribute at all: exclusion is decided by
     * `isTranslationExcluded()`, which checks `translate="no"` and `data-notrans`
     * and nothing else. It is presentational only — a hook for styling or for
     * finding these regions in devtools.
     *
     * @deprecated-attribute Retained because this line is published and a
     * `[data-ls-dont-translate]` selector may exist in consumer CSS. Removal is
     * deferred to a release wave, with a CHANGELOG entry. Do not rely on it for
     * behaviour, and do not add attributes like it — the mechanism is the standard
     * attribute below.
     *
     * The host carries the standard `translate="no"` attribute, which both the
     * tokenizer and the renderer in the base SDK already honor — so its content
     * is never tokenized, registered, or replaced. No vanilla handler needed;
     * this is pure presentational glue.
     */
    import type { Snippet } from 'svelte';

    interface Props {
        class?: string;
        tag?: string;
        children: Snippet;
    }

    let { class: clazz = '', tag = 'span', children }: Props = $props();
</script>

<svelte:element this={tag} translate="no" data-ls-dont-translate="" class={clazz}>
    {@render children?.()}
</svelte:element>
