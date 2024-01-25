<script lang="ts">
    import { _ } from '$lib/index.js';
    import strip_tags from '$lib/js/strip_tags.js';
    import persist from '$lib/js/store';

    let clazz: string = '';
    export { clazz as class };
    export let tag: string = 'translate';
    export let category: string = '';

    let content;
    // const allowedTags = '<b><strong><em><i><span><q><mark><a>';
    const allowedTags = '';

    let tokens: string[] = [];
    let parseComplete = false;
    $: {
        if (!parseComplete && content?.innerHTML) {
            console.log('CONTENT', content);
            let nodes = [].slice.call(content.childNodes);
            tokenize(nodes);
            console.log('tokens', tokens);

            // is plain token, not a content block, process the translation via normal token means
            if (tokens.length === 1) {
                content.innerText = $_[category][tokens[0]];
            } else {
                persist('contentblocks', [
                    {
                        category,
                        content: content.outerHTML,
                        tokens,
                    },
                ]);
            }

            parseComplete = true;
            // setTimeout(() => {tokenize(nodes)}, 700);
        }
    }
    $: {
        console.log('NODE TOKENS', tokens);
    }

    function tokenize(nodes) {
        nodes.forEach((node) => {
            // IF THIS IS AN ELEMENT NODE, IT'LL HAVE CHILDREN OF ATLEAST TEXT
            if (node?.hasChildNodes()) {
                var cssmap = window.getComputedStyle(node, null);
                for (const key in cssmap) {
                    const val = cssmap.getPropertyValue(key);
                    if (cssmap[key] !== '' && (typeof cssmap[key] === 'string' || typeof cssmap[key] === 'number')) node.style.setProperty(key, val);
                }
                // CHROME BUG - BOX-SHADOW NOT IN CSSMAP
                node.style.setProperty('box-shadow', cssmap.getPropertyValue('box-shadow'));
                node.removeAttribute('class');
            }

            // console.log('NODE', node);

            if (node.nodeType === node.TEXT_NODE && node.nodeValue.replace(/\s+/g, ' ').trim()) {
                tokens.push(node.nodeValue.replace(/\s+/g, ' ').trim());
                return;
            }

            // if (strip_tags(node.innerHTML, allowedTags) === node.innerHTML) {
            //     node.setAttribute('contenteditable', 'true');
            //     node.setAttribute('class', 'langsys-editable');
            //     tokens.push(node.innerText);
            //     return;
            // }

            if (!node?.hasChildNodes()) {
                // console.log('NO CHILD', node.nodeValue);
                return;
            }

            tokenize(node.childNodes);
        });
    }
</script>

<svelte:element this={tag} class={clazz || ''} bind:this={content}>
    <slot />
</svelte:element>
