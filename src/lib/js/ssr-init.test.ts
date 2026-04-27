import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writable, get } from 'svelte/store';
import type { iLangsysInitConfig } from '../index.js';

// Mock the API module globally
vi.mock('../service/LangsysAppAPI.js', () => ({
    default: {
        validate: vi.fn().mockResolvedValue({
            status: true,
            data: { key_type: 'write' }
        }),
        get: vi.fn().mockResolvedValue({
            status: true,
            data: []
        }),
        post: vi.fn().mockResolvedValue({
            status: true
        }),
        getTranslations: vi.fn().mockResolvedValue({
            status: true,
            data: {}
        }),
        config: {
            projectid: 'test-project-id'
        }
    }
}));

describe('SSR Data Passing Feature', () => {
    let LangsysApp: any;

    beforeEach(async () => {
        // Clear all module caches to get fresh instances
        vi.resetModules();
        vi.clearAllMocks();

        // Import fresh instance of LangsysApp for each test
        const module = await import('../index.js');
        LangsysApp = module.LangsysApp;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should use initialTranslations without making API call when locale matches', async () => {
        const mockTranslations: any = {
            'HomePage': {
                'Welcome': { token: 'Welcome', value: 'Bienvenue', verified: true },
                'Description': { token: 'Description', value: 'Description en français', verified: true }
            },
            'UI': {
                'Submit': { token: 'Submit', value: 'Soumettre', verified: true }
            }
        };

        const userLocale = writable('fr');

        const config: iLangsysInitConfig = {
            projectid: 'test-project-id',
            key: 'test-api-key',
            UserLocaleStore: userLocale,
            baseLocale: 'en',
            debug: true,
            initialTranslations: mockTranslations,
            initialTranslationsLocale: 'fr',
            ssrTokenStrategy: 'client'
        };

        const LangsysAppAPI = (await import('../service/LangsysAppAPI.js')).default;

        // Initialize with pre-fetched translations
        const response = await LangsysApp.init(config);
        expect(response.status).toBe(true);

        // Wait for any async operations
        await LangsysApp.translationsLoadingPromise;

        // Access the translations to verify they were loaded
        const translations = LangsysApp.Translations as any;
        const currentTranslations: any = get(translations._);

        // Verify translations are loaded from initialTranslations
        expect(currentTranslations['HomePage']).toBeDefined();
        expect(currentTranslations['HomePage']['Welcome'].value).toBe('Bienvenue');
        expect(currentTranslations['UI']['Submit'].value).toBe('Soumettre');

        // Verify that getTranslations was NOT called (would have been called if fetching from API)
        expect(LangsysAppAPI.getTranslations).not.toHaveBeenCalled();
    });

    it('should fetch from API when no initialTranslations are provided', async () => {
        const userLocale = writable('en');

        const config: iLangsysInitConfig = {
            projectid: 'test-project-id',
            key: 'test-api-key',
            UserLocaleStore: userLocale,
            baseLocale: 'en',
            debug: false
            // No initialTranslations
        };

        const LangsysAppAPI = (await import('../service/LangsysAppAPI.js')).default;

        // Mock the API to return translations
        vi.mocked(LangsysAppAPI.getTranslations).mockResolvedValue({
            status: true,
            data: {
                'HomePage': {
                    'Welcome': { token: 'Welcome', value: 'Welcome', verified: true }
                }
            }
        });

        const response = await LangsysApp.init(config);
        expect(response.status).toBe(true);

        await LangsysApp.translationsLoadingPromise;

        // Should have fetched from API
        expect(LangsysAppAPI.getTranslations).toHaveBeenCalledWith('en');
    });

    it('should handle SSR token strategies correctly', async () => {
        const userLocale = writable('en');

        // Test each strategy
        const strategies: Array<'client' | 'server' | 'auto'> = ['client', 'server', 'auto'];

        for (const strategy of strategies) {
            // Reset modules for clean test
            vi.resetModules();
            const module = await import('../index.js');
            const freshLangsysApp = module.LangsysApp;

            const config: iLangsysInitConfig = {
                projectid: `test-project-${strategy}`,
                key: 'test-api-key',
                UserLocaleStore: userLocale,
                baseLocale: 'en',
                ssrTokenStrategy: strategy
            };

            const response = await freshLangsysApp.init(config);
            expect(response.status).toBe(true);

            // Verify the strategy was set correctly in the config
            const appConfig = (freshLangsysApp as any).config;
            expect(appConfig.ssrTokenStrategy).toBe(strategy);
        }
    });

    it('should populate translations correctly with initialTranslations', async () => {
        const mockTranslations: any = {
            'Navigation': {
                'Home': { token: 'Home', value: 'Accueil', verified: true },
                'About': { token: 'About', value: 'À propos', verified: false }
            }
        };

        const userLocale = writable('fr');

        const config: iLangsysInitConfig = {
            projectid: 'test-project-id',
            key: 'test-api-key',
            UserLocaleStore: userLocale,
            baseLocale: 'en',
            initialTranslations: mockTranslations,
            initialTranslationsLocale: 'fr'
        };

        await LangsysApp.init(config);
        await LangsysApp.translationsLoadingPromise;

        // Check that translations were populated correctly
        const translations = LangsysApp.Translations as any;
        const translationStore: any = get(translations._);

        expect(translationStore['Navigation']).toBeDefined();
        expect(translationStore['Navigation']['Home'].value).toBe('Accueil');
        expect(translationStore['Navigation']['About'].value).toBe('À propos');
    });

    it('should not use initialTranslations when locale does not match', async () => {
        const mockTranslations: any = {
            'HomePage': {
                'Welcome': { token: 'Welcome', value: 'Bonjour', verified: true }
            }
        };

        const userLocale = writable('en'); // Different from initial translations locale

        const config: iLangsysInitConfig = {
            projectid: 'test-project-id',
            key: 'test-api-key',
            UserLocaleStore: userLocale,
            baseLocale: 'en',
            initialTranslations: mockTranslations,
            initialTranslationsLocale: 'fr' // Different from user locale
        };

        const LangsysAppAPI = (await import('../service/LangsysAppAPI.js')).default;

        // Mock API to return English translations
        vi.mocked(LangsysAppAPI.getTranslations).mockResolvedValue({
            status: true,
            data: {
                'HomePage': {
                    'Welcome': { token: 'Welcome', value: 'Welcome', verified: true }
                }
            }
        });

        await LangsysApp.init(config);
        await LangsysApp.translationsLoadingPromise;

        // Should have fetched from API since locales don't match
        expect(LangsysAppAPI.getTranslations).toHaveBeenCalledWith('en');
    });

    it('should properly load and use initialTranslations', async () => {
        const mockTranslations: any = {
            'Test': {
                'Item': { token: 'Item', value: 'Article', verified: true }
            }
        };

        const userLocale = writable('fr');

        const config: iLangsysInitConfig = {
            projectid: 'test-project-id',
            key: 'test-api-key',
            UserLocaleStore: userLocale,
            baseLocale: 'en',
            initialTranslations: mockTranslations,
            initialTranslationsLocale: 'fr'
        };

        const LangsysAppAPI = (await import('../service/LangsysAppAPI.js')).default;

        await LangsysApp.init(config);
        await LangsysApp.translationsLoadingPromise;

        // Verify that translations are available and populated
        const translations = LangsysApp.Translations as any;
        const translationStore: any = get(translations._);

        // Check that the translations were loaded from initial data
        expect(translationStore['Test']).toBeDefined();
        expect(translationStore['Test']['Item'].value).toBe('Article');

        // Verify that no API call was made since we provided initial translations
        expect(LangsysAppAPI.getTranslations).not.toHaveBeenCalled();
    });
});