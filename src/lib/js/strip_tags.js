function strip_tags_phpport(input, allowed) { // eslint-disable-line camelcase
    //  discuss at: https://locutus.io/php/strip_tags/
    // original by: Kevin van Zonneveld (https://kvz.io)
    // improved by: Luke Godfrey
    // improved by: Kevin van Zonneveld (https://kvz.io)
    //    input by: Pul
    //    input by: Alex
    //    input by: Marc Palau
    //    input by: Brett Zamir (https://brett-zamir.me)
    //    input by: Bobby Drake
    //    input by: Evertjan Garretsen
    // bugfixed by: Kevin van Zonneveld (https://kvz.io)
    // bugfixed by: Onno Marsman (https://twitter.com/onnomarsman)
    // bugfixed by: Kevin van Zonneveld (https://kvz.io)
    // bugfixed by: Kevin van Zonneveld (https://kvz.io)
    // bugfixed by: Eric Nagel
    // bugfixed by: Kevin van Zonneveld (https://kvz.io)
    // bugfixed by: Tomasz Wesolowski
    // bugfixed by: Tymon Sturgeon (https://scryptonite.com)
    // bugfixed by: Tim de Koning (https://www.kingsquare.nl)
    //  revised by: Rafał Kukawski (https://blog.kukawski.pl)
    //   example 1: strip_tags('<p>Kevin</p> <br /><b>van</b> <i>Zonneveld</i>', '<i><b>')
    //   returns 1: 'Kevin <b>van</b> <i>Zonneveld</i>'
    //   example 2: strip_tags('<p>Kevin <img src="someimage.png" onmouseover="someFunction()">van <i>Zonneveld</i></p>', '<p>')
    //   returns 2: '<p>Kevin van Zonneveld</p>'
    //   example 3: strip_tags("<a href='https://kvz.io'>Kevin van Zonneveld</a>", "<a>")
    //   returns 3: "<a href='https://kvz.io'>Kevin van Zonneveld</a>"
    //   example 4: strip_tags('1 < 5 5 > 1')
    //   returns 4: '1 < 5 5 > 1'
    //   example 5: strip_tags('1 <br/> 1')
    //   returns 5: '1  1'
    //   example 6: strip_tags('1 <br/> 1', '<br>')
    //   returns 6: '1 <br/> 1'
    //   example 7: strip_tags('1 <br/> 1', '<br><br/>')
    //   returns 7: '1 <br/> 1'
    //   example 8: strip_tags('<i>hello</i> <<foo>script>world<</foo>/script>')
    //   returns 8: 'hello world'
    //   example 9: strip_tags(4)
    //   returns 9: '4'
    // making sure the allowed arg is a string containing only tags in lowercase (<a><b><c>)
    allowed = (((allowed || '') + '').toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join('')
    const tags = /<\/?([a-z0-9]*)\b[^>]*>?/gi
    const commentsAndPhpTags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi
    let after = '' + input;
    // removes tha '<' char at the end of the string to replicate PHP's behaviour
    after = (after.substring(after.length - 1) === '<') ? after.substring(0, after.length - 1) : after
    // recursively remove tags to ensure that the returned string doesn't contain forbidden tags after previous passes (e.g. '<<bait/>switch/>')
    while (true) {
        const before = after
        after = before.replace(commentsAndPhpTags, '').replace(tags, function ($0, $1) {
            return allowed.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : ''
        })
        // return once no more tags are removed
        if (before === after) {
            return after
        }
    }
}

/**
 * Strips HTML and PHP tags from a string
 *
 * @param {string} input - The input string to strip tags from
 * @param {string} [allowed=''] - List of tags that should not be stripped
 * @returns {string} The input string with all HTML and PHP tags removed except those specified in allowed
 */
function strip_tags_nodom(input, allowed = '') {
    // Convert input to string if it's not already
    input = String(input);

    // Convert allowed tags to lowercase and create a regex pattern
    const allowedTags = (allowed.toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join('');
    const tags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
    const commentsAndPhpTags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi;

    // Remove the '<' char at the end of the string to replicate PHP's behaviour
    let after = input.endsWith('<') ? input.slice(0, -1) : input;

    // Recursively remove tags to ensure that the returned string doesn't contain forbidden tags after previous passes
    while (true) {
        const before = after;
        after = before
            .replace(commentsAndPhpTags, '')
            .replace(tags, (match, tag) =>
                allowedTags.includes(`<${tag.toLowerCase()}>`) ? match : ''
            );

        // Return once no more tags are removed
        if (before === after) {
            return after;
        }
    }
}


/**
 * Strips HTML and PHP tags from a string using a DOM-based approach
 *
 * @param {string} input - The input string to strip tags from
 * @param {string} [allowed=''] - List of tags that should not be stripped
 * @returns {string} The input string with all HTML and PHP tags removed except those specified in allowed
 */
function strip_tags_dom(input, allowed = '') {
    // Convert input to string if it's not already
    input = String(input);

    // Check if DOM is available
    if (typeof document === 'undefined') {
        // Fallback to non-DOM method if DOM is not available
        return strip_tags_nodom(input, allowed);
    }

    try {
        // Create a temporary DOM element
        const tempElement = document.createElement('div');
        tempElement.innerHTML = input;

        // Convert allowed tags to lowercase and create a Set for faster lookup
        const allowedTags = new Set((allowed.toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).map(tag => tag.slice(1, -1)));

        // Recursive function to process nodes
        const processNode = (node: Node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (!allowedTags.has((node as Element).tagName.toLowerCase())) {
                    // Replace this element with its text content
                    node.parentNode!.replaceChild(document.createTextNode(node.textContent || ''), node);
                } else {
                    // Process child nodes
                    Array.from(node.childNodes).forEach(processNode);
                }
            } else if (node.nodeType === Node.COMMENT_NODE || node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
                // Remove comment and processing instruction nodes
                node.parentNode!.removeChild(node);
            }
        };

        // Process all nodes
        Array.from(tempElement.childNodes).forEach(processNode);

        // Return the processed HTML
        return tempElement.innerHTML;
    } catch (error) {
        // If any error occurs during DOM manipulation, fallback to non-DOM method
        console.warn('DOM manipulation failed, falling back to non-DOM method:', error);
        return strip_tags_nodom(input, allowed);
    }
}

export default strip_tags_dom;
