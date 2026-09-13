/**
 * Shared fixture for the SRV concurrency measurement (`_dev_/e2e/srv-concurrency.mjs`).
 *
 * Synthetic catalogs, no API: the property measured is whether one server render can
 * observe another's catalog through README-SSR's process-global seed, and that is decided
 * by the renderer and the placement of the seed, not by anything the API answers.
 */
import type { iCategories } from 'langsys-js-typescript';

export const SRVC_CATEGORY = 'SRVC';

/** The phrase each locale's catalog serves for `Pricing`. Base language is `Pricing` itself. */
export const SERVED = { 'it-it': 'Prezzi', 'de-de': 'Preise' } as const;

export type SrvcLocale = keyof typeof SERVED;

export const parseLocale = (v: string | null): SrvcLocale => (v === 'de-de' ? 'de-de' : 'it-it');

export function catalogFor(locale: SrvcLocale): iCategories {
    return { [SRVC_CATEGORY]: { __category__: SRVC_CATEGORY, Pricing: SERVED[locale] } } as unknown as iCategories;
}

/**
 * A random 0–40ms wait, standing in for the catalog fetch a real `load` makes. It makes
 * concurrent requests resolve out of order, so their renders genuinely interleave at the
 * request level instead of queueing in arrival order.
 */
export const jitter = () => new Promise<void>((resolve) => setTimeout(resolve, Math.random() * 40));
