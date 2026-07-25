import { LangsysApp, LangsysAppAPI } from '$lib/index.js';
import { BASE_URL, KEYS, PROJECT_ID, userLocale } from '../harness.js';
import type { PageLoad } from './$types';

/**
 * The SSR write lane — `ssrTokenStrategy: 'server'`.
 *
 * SvelteKit is the only framework that can reach this path end to end. A
 * universal `load` genuinely runs inside the server process, so `setup()` takes
 * the SSR branch and there is no 3s client timer to mask a swallowed follow-up
 * flush. Next's App Router can't get here at all — `init()` there runs in an
 * effect, and effects don't run during server rendering, so `'server'` is inert.
 *
 * Two configurations, selected by `?grant=1`:
 *   without a grant — the server flushes registrations itself
 *   with a grant    — `'server'` DELIBERATELY degrades to `'client'` and warns,
 *                     because a grant makes write capability per-user while the
 *                     SSR lane can only hold one process-wide decision. Writing
 *                     from the server would apply one user's capability to every
 *                     later visitor in that Node process.
 *
 * NOTE: `LangsysApp` is a process-wide singleton and the Node dev server is
 * long-lived, so the first init in a process wins. Run this route against a
 * freshly started dev server, on its own — that constraint is the very thing
 * this testbed exists to respect.
 */

let started: Promise<unknown> | undefined;

export const load: PageLoad = async ({ url }) => {
    const withGrant = url.searchParams.get('grant') === '1';
    const run = url.searchParams.get('run') ?? 'ssr';
    let initError: string | null = null;

    try {
        if (!started) {
            LangsysAppAPI.setBaseUrl(BASE_URL);
            started = LangsysApp.init({
                projectid: PROJECT_ID,
                key: KEYS.ip_write,
                UserLocaleStore: userLocale,
                baseLocale: 'en-US',
                debug: true,
                ssrTokenStrategy: 'server',
                ...(withGrant ? { writeGrant: url.searchParams.get('token') ?? 'placeholder' } : {}),
            });
        }
        await started;
    } catch (e) {
        initError = e instanceof Error ? e.message : String(e);
    }

    return { initError, withGrant, run };
};
