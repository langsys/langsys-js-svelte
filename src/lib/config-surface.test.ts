import type { iLangsysInitConfig as CoreConfig } from 'langsys-js-typescript';
import { describe, expect, it } from 'vitest';
import type { iLangsysInitConfig } from './index.js';

/**
 * BIND-4 — a binding introduces no configuration the core does not define.
 *
 * The assertion that can fail here is a TYPE, checked by `npm run check`: a key on the
 * Svelte config that the core's config lacks makes `ExtraKeys` non-`never`, and the
 * `true` literal below stops type-checking. `vitest` does not type-check, so the runtime
 * `it` only gives the rule a named test; the guarantee lives in `svelte-check`.
 *
 * The binding CHANGES the types of two keys — `UserLocaleStore` takes a Svelte
 * `Writable`, `writeGrant` also accepts a store — and adds none. Changing a type is shape;
 * adding a `discovery`, `hint` or `suppress` key would be product behaviour decided one
 * layer too high, which is what the rule forbids.
 */
type ExtraKeys = Exclude<keyof iLangsysInitConfig, keyof CoreConfig>;
type MissingKeys = Exclude<keyof CoreConfig, keyof iLangsysInitConfig>;

const noExtraKeys: [ExtraKeys] extends [never] ? true : false = true;
const noMissingKeys: [MissingKeys] extends [never] ? true : false = true;

/** Control: the same machinery DOES detect an added key, so `never` above is a finding, not a blind spot. */
type WithInventedKey = iLangsysInitConfig & { discovery?: boolean };
const detectsAnInventedKey: [Exclude<keyof WithInventedKey, keyof CoreConfig>] extends [never] ? false : true = true;

describe('BIND-4 — no configuration the core does not define', () => {
    it('the Svelte config has exactly the core config’s keys (enforced by svelte-check)', () => {
        expect(noExtraKeys && noMissingKeys).toBe(true);
    });

    it('control: an invented key would be detected', () => {
        expect(detectsAnInventedKey).toBe(true);
    });
});
