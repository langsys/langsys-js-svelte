import { describe, expect, it } from 'vitest';
import { canonicalizeLocale } from './index.js';

/**
 * WIRE-3 pins the wire form for locale identifiers: lowercase `xx-yy`, used on
 * the wire AND internally, so `en-US` from a host application's locale store
 * resolves to the same catalog entry as `en-us` rather than fetching twice.
 *
 * This file exists because this repo documented the opposite. `index.ts` and the
 * README both claimed `en-us` → `en-US`, which is the exact casing WIRE-3
 * forbids — the same defect the Angular and Solid lanes each shipped, in a test
 * double and a docstring respectively. Nothing caught it, because no assertion
 * ever called the function.
 *
 * So these assert against the RE-EXPORTED function rather than a restated
 * literal. A fixture that recomputes the expected value by the same wrong rule
 * agrees with a wrong implementation perfectly.
 */
describe('canonicalizeLocale — WIRE-3 wire form', () => {
    it('lowercases, whatever casing it is handed', () => {
        expect(canonicalizeLocale('en-US')).toBe('en-us');
        expect(canonicalizeLocale('EN-us')).toBe('en-us');
        expect(canonicalizeLocale('en-us')).toBe('en-us');
    });

    it('normalises `_` separators to `-`, still lowercase', () => {
        expect(canonicalizeLocale('en_us')).toBe('en-us');
        expect(canonicalizeLocale('pt_BR')).toBe('pt-br');
    });

    it('is idempotent — the canonical form survives a second pass', () => {
        const once = canonicalizeLocale('en_US');
        expect(canonicalizeLocale(once)).toBe(once);
    });

    it('never returns an uppercase region subtag', () => {
        for (const input of ['en-US', 'pt-BR', 'zh-Hant', 'es_CR', 'FR-fr']) {
            expect(canonicalizeLocale(input)).toBe(canonicalizeLocale(input).toLowerCase());
        }
    });

    it('lowercases an invalid tag too, so identity stays consistent', () => {
        // Degrades rather than throwing; the value must still equal itself
        // across boundaries, which is what makes the failure a silent catalog
        // miss rather than an inconsistent cache key.
        expect(canonicalizeLocale('en-USA')).toBe('en-usa');
        expect(canonicalizeLocale('ENGLISH')).toBe('english');
    });
});
