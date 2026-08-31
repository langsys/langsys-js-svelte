import { describe, expect, it } from 'vitest';
import * as core from 'langsys-js-typescript';

/**
 * Guards the bench, not the behaviour.
 *
 * This repo consumes the base SDK through a **gitignored symlink** to a local
 * working copy, because the 838 surface is not published. `npm install` silently
 * replaces that link with the registry build — which resolves, loads, and
 * type-checks, but has none of the surface. Every capability assertion in the
 * suite then measures a package that cannot fail them, and reports green.
 *
 * So this file exists to make that revert a RED build rather than a quiet one.
 * It asserts symbol PRESENCE AND TYPE — `typeof` rather than truthiness, since
 * an `undefined` export and a missing one are indistinguishable to a bare check.
 *
 * The positive control is the point: `generateCustomId` ships in every published
 * version. If it is absent the package did not load at all, and the failure is a
 * broken bench rather than a wrong one — a distinction worth reading off the
 * output instead of debugging.
 */
describe('upstream precondition — the linked base SDK carries the 838 surface', () => {
    it('positive control: the package loaded (generateCustomId is a function)', () => {
        expect(typeof core.generateCustomId).toBe('function');
    });

    it('writeEnabled is an object (a Signal), not undefined', () => {
        expect(typeof core.writeEnabled).toBe('object');
        expect(core.writeEnabled).not.toBeNull();
    });

    it('setWriteGrant is a function', () => {
        expect(typeof core.setWriteGrant).toBe('function');
    });

    it('autoDiscovery is an object', () => {
        expect(typeof core.autoDiscovery).toBe('object');
        expect(core.autoDiscovery).not.toBeNull();
    });

    it('PHRASE_MARKER_ATTR is exported, so components need not restate it', () => {
        expect(typeof core.PHRASE_MARKER_ATTR).toBe('string');
        expect(core.PHRASE_MARKER_ATTR.length).toBeGreaterThan(0);
    });
});
