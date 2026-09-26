import { createRequestScope, currentlyLoadedLocale, sTranslations, tSignal, type iCategories, type Signal } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { afterEach, describe, expect, it } from 'vitest';
import ScopeStores from './ScopeStores.svelte';
import SubscriptionProbe from './SubscriptionProbe.svelte';

/**
 * Inside the core's request scope (SRV-7), which of this binding's exported stores read the
 * scope and which read the process? The process is seeded German, as if another visitor's
 * request had just run; the render happens inside an Italian scope. Served bytes only.
 */
const catalog = (pricing: string) => ({ SRVC: { __category__: 'SRVC', Pricing: pricing } }) as unknown as iCategories;
const text = (body: string, id: string) => body.match(new RegExp(`<p id="${id}">([^<]*)</p>`))?.[1];

afterEach(() => sTranslations.set({} as iCategories));

describe('exported stores inside an Italian request scope, with the process seeded German', () => {
    it('measures each store', async () => {
        sTranslations.set(catalog('Preise'));
        currentlyLoadedLocale.set('de-de');
        const scope = await createRequestScope({ locale: 'it-it', catalog: catalog('Prezzi') });
        const body = scope.run(() => render(ScopeStores).body);
        const measured = { t: text(body, 't'), locale: text(body, 'locale'), catalog: text(body, 'catalog') };
        // `$t` follows the scope; the locale and catalog stores read the process — core gap, routed
        // to the core. When the core lands it these two expectations flip, on purpose.
        expect(measured).toEqual({ t: 'Prezzi', locale: 'de-de', catalog: 'Preise' });
        await scope.close();
    });

    it('control: outside any scope all three read the process', () => {
        sTranslations.set(catalog('Preise'));
        currentlyLoadedLocale.set('de-de');
        const body = render(ScopeStores).body;
        expect({ t: text(body, 't'), locale: text(body, 'locale'), catalog: text(body, 'catalog') }).toEqual({
            t: 'Preise',
            locale: 'de-de',
            catalog: 'Preise',
        });
    });
});

describe('server renders inside request scopes release every subscription they open', () => {
    it('50 renders, each in its own scope, leave nothing open on any core signal', async () => {
        const signals: [string, Signal<unknown>][] = [
            ['tSignal', tSignal as Signal<unknown>],
            ['currentlyLoadedLocale', currentlyLoadedLocale as Signal<unknown>],
            ['sTranslations', sTranslations as Signal<unknown>],
        ];
        const tally = new Map(signals.map(([n]) => [n, { opened: 0, released: 0 }]));
        const originals = signals.map(([n, s]) => {
            const original = s.subscribe;
            s.subscribe = ((run: (v: unknown) => void) => {
                tally.get(n)!.opened += 1;
                const stop = original.call(s, run);
                let done = false;
                return () => {
                    if (!done) tally.get(n)!.released += 1;
                    done = true;
                    stop();
                };
            }) as Signal<unknown>['subscribe'];
            return () => (s.subscribe = original);
        });
        try {
            for (let i = 0; i < 50; i++) {
                const scope = await createRequestScope({ locale: i % 2 ? 'de-de' : 'it-it', catalog: catalog(i % 2 ? 'Preise' : 'Prezzi') });
                void scope.run(() => render(SubscriptionProbe, { props: {} }).body);
                await scope.close();
            }
        } finally {
            originals.forEach((restore) => restore());
        }
        const counts = Object.fromEntries(tally);
        for (const c of Object.values(counts)) expect(c.opened).toBeGreaterThan(0);
        expect(Object.values(counts).map((c) => c.opened - c.released)).toEqual([0, 0, 0]);
        expect(counts).toEqual({
            tSignal: { opened: 100, released: 100 },
            currentlyLoadedLocale: { opened: 50, released: 50 },
            sTranslations: { opened: 50, released: 50 },
        });
    });
});
