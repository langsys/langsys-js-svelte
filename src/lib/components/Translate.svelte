<script lang="ts">
    /**
     * Translate component
     * This component will display the content of the element in the current locale in a blocking manner
     *
     * If the content is not already tokenized, it will tokenize the content and save it to Langsys
     *    The HTML it saves to Langsys is a clone of the content with all styles inline
     *    This is so the Translation Manager can display the content as it would be displayed in the app
     * It will automatically translate the content after tokenization (blocking)
     * If the locale changes, it will rerender the component with the translated content
     * If the locale is the base locale, it will not translate the content (speed)
     *      unless the lastTranslatedLocale is not the base locale
     *      (allows reversion back to base locale after translation)
     *
     */
    import { _ } from '$lib/index.js';
    import { type iContentBlock } from '$lib/interface/iContentBlock.js';
    import echo from '$lib/js/echo.js';
    import { inArray, isEmpty, md5 } from '$lib/js/util.js';
    import LangsysAppAPI from '$lib/service/LangsysAppAPI.js';
    import config from '$lib/store/config.js';
    import { contentBlocks } from '$lib/store/contentBlocks.js';
    import currentlyLoadedLocale from '$lib/store/currentlyLoadedLocale.js';

    import type { Snippet } from 'svelte';

    interface Props {
        class?: string;
        tag?: string;
        label?: string;
        category?: string;
        custom_id?: string;
        children?: Snippet;
    }

    let { class: clazz = '', tag = 'translate', label = '', category = '', custom_id = '', children }: Props = $props();

    let content = $state<HTMLElement>();
    let contentClone = $state<HTMLElement>();
    let lastTranslatedLocale = $state('');
    const allowedTags = '';

    let tokens = $state<string[]>([]);
    let parseComplete = $state(false);
    let isTokenizing = $state(false);

    type iNode = Node & { originalNodeValue?: string | null };

    // on first load, tokenize the content and save to Langsys if necessary
    $effect(() => {
        if (!parseComplete && !isTokenizing && content?.innerHTML && !tokens.length) {
            tokenizeContent();
        }
    });

    // after first load (parseComplete), retranslate the content if the locale changes
    $effect(() => {
        if ($currentlyLoadedLocale && parseComplete) {
            translateUpdate();
        }
    });

    function translateUpdate() {
        if (content?.innerHTML && parseComplete) {
            if (lastTranslatedLocale === $currentlyLoadedLocale) return;

            if (tokens.length === 1) {
                content.innerText = $_[category][tokens[0]];
            } else {
                translate(Array.from(content.childNodes));
                lastTranslatedLocale = $currentlyLoadedLocale;
            }
        }
    }

    /**
     * Primary function to tokenize, save and translate the content of the element
     */
    async function tokenizeContent() {
        if (isTokenizing) return; // Prevent multiple simultaneous tokenizations
        
        if (!content || !content.childNodes.length) {
            parseComplete = true;
            isTokenizing = false;
            return false;
        }
        
        isTokenizing = true;
        // we tokenize off a clone because part of the process is to move all styles inline, which we DONT want to do in the view
        // we only want that to happen for the html stored with the contentblock
        contentClone = content.cloneNode(true) as HTMLElement;
        const nodes = Array.from(contentClone.childNodes || []);
        tokenize(nodes);

        if (tokens.length === 1) {
            content.innerText = $_[category][tokens[0]]; // single token translation
        } else {
            const contentBlock: iContentBlock = {
                custom_id: '', // to be filed by handleContentBlock
                category,
                label,
                content: contentClone!.outerHTML,
                tokens,
            };
            await handleContentBlock(contentBlock, nodes);
        }

        parseComplete = true;
        isTokenizing = false;
    }

    /**
     * With iContentBlock now assembled, we make sure it has a custom_id then we save it to Langsys
     * After custom_id is set we run a translate on the elements, assumes we have the translation data already
     * @param contentBlock
     * @param nodes
     */
    async function handleContentBlock(contentBlock: iContentBlock, nodes: Node[] = []) {
        // determine custom id for translate fast lookup
        if (isEmpty(custom_id)) custom_id = generateCustomId(contentBlock);
        contentBlock.custom_id = custom_id;
        
        // Check if we already have this content block by custom_id
        const existingBlock = $contentBlocks.find(block => block.custom_id === custom_id);
        if (!existingBlock) {

            // save the content block to Langsys asyncronously
            LangsysAppAPI.post('projects/[projectid]/content-blocks', contentBlock).then((response) => {
                if (!response.status) {
                    echo.group(echo.asAlert('Could not save content block'));
                    echo.error(response.errors);
                    echo.groupEnd();
                    // console.error('Could not save content block', response.errors);
                } else {
                    // local store so we know we don't have to save it again
                    $contentBlocks.push(contentBlock);
                    contentBlocks.set($contentBlocks);
                }
            });

            // translate the content block (blocking)
            if (tokens.length > 1 && content) {
                translate(Array.from(content.childNodes));
                lastTranslatedLocale = $currentlyLoadedLocale;
            }
        }
    }

    /**
     * Tokenize the content of the element and store them in the tokens array
     * @param nodes
     */
    function tokenize(nodes: iNode[], indices: number[] = []) {
        nodes.forEach((node, index) => {
            if (node?.hasChildNodes()) {
                applyStylesToNode(node as HTMLElement, [...indices, index]);
            }

            const contentToken = node.nodeValue?.replace(/\s+/g, ' ').trim();
            if (node?.nodeType === Node.TEXT_NODE && contentToken) {
                // console.log('Tokenizing', contentToken);
                // store the original token, this gets pushed to Langsys
                tokens.push(contentToken);
                return;
            }

            if (!node?.hasChildNodes()) {
                return;
            }

            tokenize(Array.from(node.childNodes), [...indices, index]);
        });
    }
    function findNode(nodes: iNode[], indices: number[]): Element | undefined {
        let currentNode = nodes[indices[0]];

        for (let i = 1; i < indices.length; i++) {
            if (!currentNode || !currentNode.hasChildNodes()) {
                return undefined;
            }

            currentNode = Array.from(currentNode.childNodes)[indices[i]];
        }

        return currentNode as Element;
    }

    /**
     * Translate the content of the element using the scoped custom_id varible
     * @param nodes
     */
    function translate(nodes: iNode[]) {
        // console.log('translate run', $currentlyLoadedLocale, lastTranslatedLocale, config.baseLocale);
        if ($currentlyLoadedLocale === config.baseLocale && (lastTranslatedLocale === '' || lastTranslatedLocale === config.baseLocale)) return;

        nodes.forEach((node) => {
            // if this isn't a text node, skip or go deeper
            if (node?.nodeType !== Node.TEXT_NODE) {
                if (!node?.hasChildNodes()) return;
                translate(Array.from(node.childNodes));
                return;
            }

            // if this text node is empty, skip
            if (isEmpty(node.nodeValue?.trim())) return;

            // first time through we save the originalNodeValue
            if (isEmpty(node.originalNodeValue)) {
                // console.log('translate: setting originalNodeValue', node.nodeValue);
                node.originalNodeValue = node.nodeValue;
            }

            // window.console.log('Translating', node.originalNodeValue);

            // this is only run after tokenize, so we know we have a custom_id,
            // and the origianlNodeValue is set. We create the token from the originalNodeValue
            const contentToken = node.originalNodeValue?.replace(/\s+/g, ' ').trim();
            if (!contentToken) return;

            // Get translation with proper type safety
            let translation: string | null = null;
            if (contentToken && $_[category] && $_[category][custom_id]) {
                const categoryData = $_[category] as any;
                const contentData = categoryData[custom_id] as any;
                translation = contentData[contentToken] || null;
            }

            // we do a replace here instead of just setting the value because the tokens are stripped of extra whitespace,
            // which we want to keep in the end user display
            if (translation && contentToken && node.originalNodeValue) {
                node.nodeValue = node.originalNodeValue.replace(contentToken, translation);
            }
            // if there's no translation, we revert back to originalContent
            else if (node.originalNodeValue) {
                node.nodeValue = node.originalNodeValue;
            }

            // if (!node?.hasChildNodes()) {
            //     return;
            // }

            // translate(Array.from(node.childNodes));
        });
    }

    /**
     * Generate a custom id for the content block
     * @param contentBlock
     */
    function generateCustomId(contentBlock: iContentBlock) {
        return md5(`${contentBlock.category}-${contentBlock.tokens.join('-')}`);
    }

    /**
     * Apply the styles of the node to the element for display reproduction in Translation Manager
     * @param node
     */
    function applyStylesToNode(node: HTMLElement, indices: number[]) {
        if (!content) return;
        let domNode = findNode(Array.from(content.childNodes), indices);
        // let cloneFind = findNode(Array.from(contentClone.childNodes), indices);
        // console.log('applyStylesToNode', domNode, node, indices, cloneFind);
        if (!domNode) return;
        const cssmap = window.getComputedStyle(domNode, null);
        for (const key in cssmap) {
            const val = cssmap.getPropertyValue(key);
            if (cssmap[key] !== '' && (typeof cssmap[key] === 'string' || typeof cssmap[key] === 'number')) {
                if (['width', 'height'].includes(key)) continue;
                node.style.setProperty(key, val);
            }
        }
        node.style.setProperty('box-shadow', cssmap.getPropertyValue('box-shadow'));
        node.removeAttribute('class');
    }
</script>

<svelte:element this={tag} class={clazz || ''} bind:this={content}>
    {#if children}
        {@render children()}
    {/if}
</svelte:element>
