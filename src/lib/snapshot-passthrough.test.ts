import * as core from 'langsys-js-typescript';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import vectors from '../../vectors/snapshot-vectors.json';
import { LangsysApp, OVERRIDDEN_MEMBERS, t } from './index.js';

/**
 * SNAP-2 / SNAP-3 through this binding. A snapshot enters through `LangsysApp.loadSnapshot`,
 * which the proxy forwards to the core — this binding does not override it, parse the file,
 * or decide anything about it. Pinned two ways: at the seam, the core receives the very
 * objects the app passed; and end to end, a snapshot loaded through the binding is what `$t`
 * renders on the next line, while an edited snapshot's refusal reaches the app unchanged.
 *
 * `vectors/snapshot-vectors.json` is vendored byte-exact from langsys-js-typescript and cited
 * by git blob in CONFORMANCE.md.
 */
type Load = { id: string; document: Record<string, unknown>; locale: string; expect_catalog: Record<string, Record<string, string>> };
type Refusal = { id: string; document: Record<string, unknown>; refuse: string };
const loads = (vectors as unknown as { loads: Load[] }).loads;
const refusals = (vectors as unknown as { refusals: Refusal[] }).refusals;

afterEach(() => {
    vi.restoreAllMocks();
    core.sTranslations.set({} as core.iCategories);
});

describe('loadSnapshot reaches the core untouched', () => {
    it('control: the vendored file carries load and refusal rows', () => {
        expect(loads.length).toBeGreaterThan(0);
        expect(refusals.length).toBeGreaterThan(0);
    });

    it('the core receives the same snapshot object and locale, and its answer comes back', () => {
        const spy = vi.spyOn(core.LangsysApp, 'loadSnapshot').mockReturnValue(true);
        const doc = loads[0].document;
        expect(LangsysApp.loadSnapshot(doc as never, 'en')).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toBe(doc);
        expect(spy.mock.calls[0][1]).toBe('en');
    });

    it('control: loadSnapshot is a bound forward, not a binding override', () => {
        expect(LangsysApp.loadSnapshot.name).toMatch(/^bound /);
        expect(OVERRIDDEN_MEMBERS).not.toContain('loadSnapshot');
    });
});

describe('a snapshot loaded through the binding is what $t renders', () => {
    it.each(loads.map((r) => [r.id, r] as const))('%s', (_id, row) => {
        expect(LangsysApp.loadSnapshot(row.document as never, row.locale)).toBe(true);
        const render = get(t) as unknown as (p: string, c: string) => string;
        for (const [category, phrases] of Object.entries(row.expect_catalog)) {
            for (const [phrase, translation] of Object.entries(phrases)) expect(render(phrase, category)).toBe(translation || phrase);
        }
    });

    it.each(refusals.map((r) => [r.id, r] as const))('refusal %s reaches the app as the core raised it', (_id, row) => {
        let caught: unknown;
        try {
            LangsysApp.loadSnapshot(row.document as never);
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(core.SnapshotError);
        expect((caught as { reason: string }).reason).toBe(row.refuse);
    });
});
