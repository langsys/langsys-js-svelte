<script lang="ts">
    /**
     * DontTranslate — marks a region as never-translated, preserved verbatim.
     *
     *   Built with <DontTranslate>Kangen®</DontTranslate> on
     *   <DontTranslate>langsys.dev</DontTranslate>
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
