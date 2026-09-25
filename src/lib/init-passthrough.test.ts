import * as core from 'langsys-js-typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writable } from 'svelte/store';
import { LangsysApp, type iLangsysInitConfig } from './index.js';

/**
 * The `init` override adapts two keys and must hand every other one to the core untouched —
 * by identity, not merely by equal value. MIG's `legacyKeys` is the case that motivated this:
 * a binding that copied, filtered or re-shaped it would decide which legacy files the core
 * reads, which is the core's rule (BIND-1, BIND-4).
 *
 * Observed at the seam: the core's `init` is replaced with a spy, so the assertion is on the
 * object the core actually receives.
 */
afterEach(() => vi.restoreAllMocks());

function captureCoreInit(config: iLangsysInitConfig): Record<string, unknown> {
    const spy = vi.spyOn(core.LangsysApp, 'init').mockResolvedValue({} as never);
    void LangsysApp.init(config);
    expect(spy).toHaveBeenCalledTimes(1);
    return spy.mock.calls[0][0] as unknown as Record<string, unknown>;
}

const legacyKeys = [{ name: 'en.json', format: 'i18next' as const, data: { checkout: { submit: 'Place order' } } }];

describe('init hands the migration config, and every other unadapted key, to the core untouched', () => {
    const config = {
        projectid: 'p1',
        key: 'k',
        UserLocaleStore: writable('en-us'),
        baseLocale: 'en-us',
        messagesCategory: 'Errors',
        legacyKeys,
    } as unknown as iLangsysInitConfig;

    it('legacyKeys reaches the core as the same array, holding the same file objects', () => {
        const received = captureCoreInit(config);
        expect(received.legacyKeys).toBe(legacyKeys);
        expect((received.legacyKeys as unknown[])[0]).toBe(legacyKeys[0]);
    });

    it('every key the binding does not adapt arrives by identity', () => {
        const received = captureCoreInit(config);
        for (const k of Object.keys(config).filter((k) => k !== 'UserLocaleStore' && k !== 'writeGrant')) {
            expect(received[k], k).toBe((config as unknown as Record<string, unknown>)[k]);
        }
    });

    it('control: the adapted key does NOT arrive by identity, so the comparison can fail', () => {
        const received = captureCoreInit(config);
        expect(received.UserLocaleStore).not.toBe(config.UserLocaleStore);
        expect(typeof (received.UserLocaleStore as { get: unknown }).get).toBe('function');
    });

    it('an unset mode stays unset — the binding adds no legacyKeys of its own', () => {
        const { legacyKeys: _omit, ...withoutMode } = config as unknown as Record<string, unknown>;
        void _omit;
        const received = captureCoreInit(withoutMode as unknown as iLangsysInitConfig);
        expect('legacyKeys' in received).toBe(false);
    });
});
