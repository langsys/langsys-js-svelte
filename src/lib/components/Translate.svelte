<script lang="ts">
    import { _ } from '$lib/index.js';
    import strip_tags from '$lib/js/strip_tags.js';
    import persist from '$lib/js/store';
    import LangsysAppAPI from '$lib/service/LangsysAppAPI.js';
    import type { iContentBlock } from '$lib/interface/iContentBlock.js';
    import { contentBlocks } from '$lib/store/contentBlocks.js';
    import { inArray } from '$lib/js/util.js';

    let clazz: string = '';
    export { clazz as class };
    export let tag: string = 'translate';
    export let category: string = '';

    let content: HTMLElement;
    const allowedTags = '';

    let tokens: string[] = [];
    let parseComplete = false;

    $: {
        if (!parseComplete && content?.innerHTML) {
            tokenizeContent();
        }
    }

    async function tokenizeContent() {
        if (!content || !content.childNodes.length) {
            parseComplete = true;
            return false;
        }
        const nodes = Array.from(content.childNodes || []);
        tokenize(nodes);

        if (tokens.length === 1) {
            content.innerText = $_[category][tokens[0]];
        } else {
            const contentBlock: iContentBlock = {
                category,
                content: content!.outerHTML,
                tokens,
            };
            await handleContentBlock(contentBlock);
        }

        parseComplete = true;
    }

    async function handleContentBlock(contentBlock: iContentBlock) {
        console.log(contentBlock, $contentBlocks);
        if (!inArray(contentBlock, $contentBlocks)) {
            const response = await LangsysAppAPI.post('content-blocks/[projectid]', contentBlock);
            if (!response.status) {
                console.error('Could not save content block', response.errors);
            } else {
                $contentBlocks.push(contentBlock);
                contentBlocks.set($contentBlocks);
            }
        }
    }

    function tokenize(nodes: Node[]) {
        nodes.forEach((node) => {
            if (node?.hasChildNodes()) {
                applyStylesToNode(node as HTMLElement);
            }

            if (node?.nodeType === Node.TEXT_NODE && node.nodeValue?.replace(/\s+/g, ' ').trim()) {
                tokens.push(node.nodeValue.replace(/\s+/g, ' ').trim());
                return;
            }

            if (!node?.hasChildNodes()) {
                return;
            }

            tokenize(Array.from(node.childNodes));
        });
    }

    function applyStylesToNode(node: HTMLElement) {
        const cssmap = window.getComputedStyle(node, null);
        for (const key in cssmap) {
            const val = cssmap.getPropertyValue(key);
            if (cssmap[key] !== '' && (typeof cssmap[key] === 'string' || typeof cssmap[key] === 'number')) {
                node.style.setProperty(key, val);
            }
        }
        node.style.setProperty('box-shadow', cssmap.getPropertyValue('box-shadow'));
        node.removeAttribute('class');
    }
</script>

<svelte:element this={tag} class={clazz || ''} bind:this={content}>
    <slot />
</svelte:element>
