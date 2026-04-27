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
    import { isEmpty, md5 } from '$lib/js/util.js';
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
        children: Snippet;
    }

    let { class: clazz = '', tag = 'translate', label = '', category = '', custom_id = '', children }: Props = $props();

    let content = $state<HTMLElement>();
    let contentClone = $state<HTMLElement>();
    let lastTranslatedLocale = $state('');

    let tokens = $state<string[]>([]);
    let parseComplete = $state(false);
    let isTokenizing = $state(false);

    type iNode = Node & { originalNodeValue?: string | null };
    type iElement = HTMLElement & { originalAttributes?: Record<string, string> };

    /**
     * Translatable HTML attributes that should be extracted and stored as translation entries.
     * These attributes contain user-facing text that needs localization.
     */
    const TRANSLATABLE_ATTRIBUTES = [
        'placeholder', // <input>, <textarea>
        'alt', // <img>, <input>
        'title', // Any element - tooltip text
        'aria-label', // Any element - accessibility label
        'aria-placeholder', // Any element - ARIA placeholder text
        'data-error', // Validation error message
        'data-error-message', // Validation error message
        'data-validation-message', // Validation hint
        'data-invalid-message', // Validation hint
        'data-required-message', // Required field message
        'data-pattern-message', // Pattern validation message
    ];

    /**
     * Elements where the 'value' attribute should be translated (display-only buttons, not form data)
     */
    const VALUE_TRANSLATABLE_ELEMENTS = ['button'];
    const VALUE_TRANSLATABLE_INPUT_TYPES = ['submit', 'button'];

    // on first load, tokenize the content and save to Langsys if necessary
    $effect(() => {
        if (!parseComplete && !isTokenizing && content?.innerHTML) {
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
                // Check if category exists in translations before accessing
                if (category && $_[category] && $_[category][tokens[0]]) {
                    content.innerText = $_[category][tokens[0]];
                } else if (!category && $_.__uncategorized__ && $_.__uncategorized__[tokens[0]]) {
                    // When no category, use uncategorized translations
                    content.innerText = $_.__uncategorized__[tokens[0]];
                } else {
                    // Keep original content if no translation available
                    content.innerText = tokens[0];
                }
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
            // Check if category exists in translations before accessing
            if (category && $_[category] && $_[category][tokens[0]]) {
                content.innerText = $_[category][tokens[0]]; // single token translation
            } else if (!category && $_.__uncategorized__ && $_.__uncategorized__[tokens[0]]) {
                // When no category, use uncategorized translations
                content.innerText = $_.__uncategorized__[tokens[0]];
            } else {
                // Keep original content if no translation available
                content.innerText = tokens[0];
            }
        } else {
            const contentBlock: iContentBlock = {
                custom_id: '', // to be filed by handleContentBlock
                category,
                label,
                content: contentClone!.outerHTML,
                tokens,
            };
            await handleContentBlock(contentBlock);
        }

        parseComplete = true;
        isTokenizing = false;
    }

    /**
     * With iContentBlock now assembled, we make sure it has a custom_id then we save it to Langsys
     * After custom_id is set we run a translate on the elements, assumes we have the translation data already
     * @param contentBlock
     */
    async function handleContentBlock(contentBlock: iContentBlock) {
        // determine custom id for translate fast lookup
        if (isEmpty(custom_id)) custom_id = generateCustomId(contentBlock);
        contentBlock.custom_id = custom_id;

        // Check if we already have this content block by custom_id
        const existingBlock = $contentBlocks.find((block) => block.custom_id === custom_id);
        if (!existingBlock) {
            // Only save content blocks if API key has write permissions
            if (config.key_type === 'write') {
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
            } else {
                if (config.debug) {
                    echo.log(`Skipping content block save (API key is ${config.key_type || 'unknown'})`);
                }
            }

            // translate the content block (blocking)
            if (tokens.length > 1 && content) {
                translate(Array.from(content.childNodes));
                lastTranslatedLocale = $currentlyLoadedLocale;
            }
        }
    }

    /**
     * Tokenize the content of the element and store them in the tokens array.
     * This includes both text nodes and translatable attributes on elements.
     * Respects the HTML translate="no" attribute to skip elements and their children.
     * @param nodes
     */
    function tokenize(nodes: iNode[], indices: number[] = []) {
        nodes.forEach((node, index) => {
            // Respect translate="no" attribute - skip this element and all its children
            if (node?.nodeType === Node.ELEMENT_NODE) {
                const element = node as HTMLElement;
                if (element.getAttribute('translate') === 'no') {
                    return;
                }
            }

            if (node?.hasChildNodes()) {
                applyStylesToNode(node as HTMLElement, [...indices, index]);
            }

            // Extract translatable attributes from element nodes
            if (node?.nodeType === Node.ELEMENT_NODE) {
                tokenizeAttributes(node as HTMLElement);
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

    /**
     * Extract translatable attribute values from an element and add them to the tokens array.
     * Also normalizes image src attributes to fully qualified URLs.
     * @param element - The element to extract attributes from
     */
    function tokenizeAttributes(element: HTMLElement) {
        const tagName = element.tagName.toLowerCase();

        // For images, convert relative src to fully qualified URL
        if (tagName === 'img') {
            const img = element as HTMLImageElement;
            if (img.src) {
                // img.src returns the fully qualified URL even if the attribute is relative
                element.setAttribute('src', img.src);
            }
        }

        // Check standard translatable attributes
        for (const attr of TRANSLATABLE_ATTRIBUTES) {
            const value = element.getAttribute(attr)?.trim();
            if (value) {
                tokens.push(value);
            }
        }

        // Check 'value' attribute for button-like elements
        if (VALUE_TRANSLATABLE_ELEMENTS.includes(tagName)) {
            const value = element.getAttribute('value')?.trim();
            if (value) {
                tokens.push(value);
            }
        }

        // Check 'value' attribute for input[type="submit"] and input[type="button"]
        if (tagName === 'input') {
            const inputType = element.getAttribute('type')?.toLowerCase();
            if (inputType && VALUE_TRANSLATABLE_INPUT_TYPES.includes(inputType)) {
                const value = element.getAttribute('value')?.trim();
                if (value) {
                    tokens.push(value);
                }
            }
        }

        // Handle <option> elements within <select>
        if (tagName === 'select') {
            const options = element.querySelectorAll('option');
            options.forEach((option) => {
                const optionText = option.textContent?.trim();
                if (optionText) {
                    tokens.push(optionText);
                }
            });
        }
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
     * Translate the content of the element using the scoped custom_id variable.
     * This handles both text nodes and translatable attributes on elements.
     * Respects the HTML translate="no" attribute to skip elements and their children.
     * @param nodes
     */
    function translate(nodes: iNode[]) {
        // console.log('translate run', $currentlyLoadedLocale, lastTranslatedLocale, config.baseLocale);
        if ($currentlyLoadedLocale === config.baseLocale && (lastTranslatedLocale === '' || lastTranslatedLocale === config.baseLocale)) return;

        nodes.forEach((node) => {
            // Respect translate="no" attribute - skip this element and all its children
            if (node?.nodeType === Node.ELEMENT_NODE) {
                const element = node as HTMLElement;
                if (element.getAttribute('translate') === 'no') {
                    return;
                }
            }

            // Handle element nodes - translate their attributes
            if (node?.nodeType === Node.ELEMENT_NODE) {
                translateAttributes(node as iElement);
            }

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

            const translation = getTranslation(contentToken);

            // we do a replace here instead of just setting the value because the tokens are stripped of extra whitespace,
            // which we want to keep in the end user display
            if (translation && contentToken && node.originalNodeValue) {
                node.nodeValue = node.originalNodeValue.replace(contentToken, translation);
            }
            // if there's no translation, we revert back to originalContent
            else if (node.originalNodeValue) {
                node.nodeValue = node.originalNodeValue;
            }
        });
    }

    /**
     * Get translation for a given token from the translations store.
     * @param token - The original text to translate
     * @returns The translated text or null if not found
     */
    function getTranslation(token: string): string | null {
        if (token && $_[category] && $_[category][custom_id]) {
            const categoryData = $_[category] as any;
            const contentData = categoryData[custom_id] as any;
            return contentData[token] || null;
        } else if (!category && token && $_.__uncategorized__ && $_.__uncategorized__[custom_id]) {
            // Handle uncategorized translations
            const uncategorizedData = $_.__uncategorized__ as any;
            const contentData = uncategorizedData[custom_id] as any;
            return contentData[token] || null;
        }
        return null;
    }

    /**
     * Translate translatable attributes on an element.
     * @param element - The element to translate attributes on
     */
    function translateAttributes(element: iElement) {
        const tagName = element.tagName.toLowerCase();

        // Initialize originalAttributes storage if needed
        if (!element.originalAttributes) {
            element.originalAttributes = {};
        }

        // Translate standard translatable attributes
        for (const attr of TRANSLATABLE_ATTRIBUTES) {
            translateAttribute(element, attr);
        }

        // Translate 'value' attribute for button-like elements
        if (VALUE_TRANSLATABLE_ELEMENTS.includes(tagName)) {
            translateAttribute(element, 'value');
        }

        // Translate 'value' attribute for input[type="submit"] and input[type="button"]
        if (tagName === 'input') {
            const inputType = element.getAttribute('type')?.toLowerCase();
            if (inputType && VALUE_TRANSLATABLE_INPUT_TYPES.includes(inputType)) {
                translateAttribute(element, 'value');
            }
        }

        // Handle <option> elements within <select>
        if (tagName === 'select') {
            const options = element.querySelectorAll('option');
            options.forEach((option) => {
                const optionEl = option as iElement;
                if (!optionEl.originalAttributes) {
                    optionEl.originalAttributes = {};
                }

                // Store original text content
                if (optionEl.originalAttributes['textContent'] === undefined) {
                    optionEl.originalAttributes['textContent'] = option.textContent || '';
                }

                const originalText = optionEl.originalAttributes['textContent'].trim();
                if (originalText) {
                    const translation = getTranslation(originalText);
                    if (translation) {
                        option.textContent = translation;
                    } else {
                        option.textContent = optionEl.originalAttributes['textContent'];
                    }
                }
            });
        }
    }

    /**
     * Translate a single attribute on an element.
     * @param element - The element containing the attribute
     * @param attr - The attribute name to translate
     */
    function translateAttribute(element: iElement, attr: string) {
        const currentValue = element.getAttribute(attr);
        if (!currentValue) return;

        // Store original value on first translation
        if (element.originalAttributes![attr] === undefined) {
            element.originalAttributes![attr] = currentValue;
        }

        const originalValue = element.originalAttributes![attr].trim();
        if (!originalValue) return;

        const translation = getTranslation(originalValue);
        if (translation) {
            element.setAttribute(attr, translation);
        } else {
            // Revert to original if no translation
            element.setAttribute(attr, element.originalAttributes![attr]);
        }
    }

    /**
     * Generate a custom id for the content block
     * @param contentBlock
     */
    function generateCustomId(contentBlock: iContentBlock) {
        return md5(`${contentBlock.category}-${contentBlock.tokens.join('-')}`);
    }

    /**
     * Semantically meaningful CSS properties to capture for Translation Manager rendering.
     * These are properties that typically define the visual appearance of content,
     * excluding layout properties that depend on container context.
     */
    const SEMANTIC_STYLE_PROPERTIES = [
        // Typography (excluding font-family - controlled by Translation Manager)
        'font-size',
        'font-weight',
        'font-style',
        'font-variant',
        'line-height',
        'letter-spacing',
        'word-spacing',
        'text-align',
        'text-decoration',
        'text-transform',
        'text-indent',
        'text-shadow',
        'white-space',
        '-webkit-font-smoothing',

        // Colors
        'color',
        'background-color',
        'background-image',
        'background-position',
        'background-size',
        'background-repeat',

        // Borders
        'border',
        'border-top',
        'border-right',
        'border-bottom',
        'border-left',
        'border-radius',
        'border-color',
        'border-width',
        'border-style',

        // Spacing (margins and padding)
        'margin',
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
        'padding',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',

        // Visual effects
        'box-shadow',
        'opacity',
        'filter',

        // Display & visibility
        'display',
        'visibility',
        'list-style',
        'list-style-type',

        // Cursor
        'cursor',
    ];

    /**
     * Apply only semantically meaningful styles to the node for display reproduction in Translation Manager.
     * Instead of capturing ALL computed styles, we only capture styles that differ from browser defaults
     * and are visually meaningful. Translation Manager renders content in Shadow DOM for style isolation.
     * @param node - The cloned node to apply styles to
     * @param indices - Path indices to find the corresponding DOM node
     */
    function applyStylesToNode(node: HTMLElement, indices: number[]) {
        if (!content) return;
        const domNode = findNode(Array.from(content.childNodes), indices);
        if (!domNode) return;

        // Create a reference element of the same tag to get browser defaults
        const tagName = domNode.tagName.toLowerCase();
        const reference = document.createElement(tagName);
        reference.style.visibility = 'hidden';
        reference.style.position = 'absolute';
        document.body.appendChild(reference);

        const computed = window.getComputedStyle(domNode);
        const defaults = window.getComputedStyle(reference);

        // Only capture semantic styles that differ from defaults
        for (const prop of SEMANTIC_STYLE_PROPERTIES) {
            const value = computed.getPropertyValue(prop);
            const defaultValue = defaults.getPropertyValue(prop);

            if (value && value !== defaultValue) {
                node.style.setProperty(prop, value);
            }
        }

        document.body.removeChild(reference);
        node.removeAttribute('class');
    }
</script>

<svelte:element this={tag} class={clazz || ''} bind:this={content}>
    {@render children?.()}
</svelte:element>
