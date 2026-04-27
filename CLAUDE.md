# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Svelte SDK for the Langsys Translation Manager - a localization service that provides real-time translations for web applications. The SDK requires Svelte 5 and is fully compatible with SSR (Server-Side Rendering) in SvelteKit applications. It is distributed as an npm package (`langsys-js-svelte`).

**Version Compatibility:**
- Current version: Svelte 5 only with SSR support
- Legacy support: Tag `v-last-svelte4-compat` for Svelte 3/4 (client-side only)

## Essential Commands

**Development:**
- `npm run dev` - Start development server
- `npm run build` - Build the project
- `npm run package` - Create distributable package
- `npm run test` - Run tests with Vitest
- `npm run check` - Run svelte-check for type checking
- `npm run lint` - Run Prettier and ESLint
- `npm run watch` - Watch mode for auto-packaging

## Architecture Overview

The SDK is built around these core components:

1. **LangsysApp** (`src/lib/index.ts`): Main singleton class that manages initialization, locale switching, and provides utility functions. Access via `LangsysApp.getApp()`. Initialize with a config object: `LangsysApp.init(config)`. The legacy parameter-based approach is deprecated and will be removed.

2. **Translations Store** (`$_`): A reactive Svelte store for translations. Usage: `$_['Category']['Token']`. When write permissions are enabled, missing tokens are automatically sent to the Langsys API.

3. **LangsysAppAPI** (`src/lib/service/LangsysAppAPI.ts`): Handles all API communication with the Langsys backend, including fetching translations and reporting missing tokens.

4. **Translate Component** (`src/lib/components/Translate.svelte`): Used for translating larger HTML content blocks while preserving styling.

5. **Storage Layer**: Uses a progressive storage strategy with automatic fallbacks for SSR compatibility:
   - Primary: IndexedDB (client-side, persistent)
   - Fallback 1: localStorage (client-side, limited size)
   - Fallback 2: Memory-only store (SSR/restricted environments)

## Key Implementation Details

- The SDK uses a singleton pattern - always use `LangsysApp.getApp()` instead of creating new instances
- Translation data is cached for 60 seconds to prevent excessive API calls
- The project exports from `src/lib/index.ts` - ensure all public APIs are exposed there
- Content blocks are special translation units that preserve HTML structure and styling
- The SDK supports automatic locale detection and switching
- Missing translation tokens are batched and sent to the API every 3 seconds when write permissions are enabled
- API key permissions are automatically detected:
  - Write permission: Enables automatic token and content block creation
  - Read-only permission: Only fetches translations, no creation operations
- The SDK is fully SSR-compatible with SvelteKit applications
- SSR token handling is configurable via `ssrTokenStrategy`:
  - `'client'` (default): Tokens collected during SSR, sent from client after hydration
  - `'server'`: Tokens sent immediately from server during SSR
  - `'auto'`: Hybrid approach based on batch size

## Testing Approach

Tests use Vitest. Run individual tests with:
- `npm run test -- path/to/test.ts`

Currently, the test infrastructure is set up but needs expansion. New features should include corresponding tests.