// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

interface ImportMetaEnv {
	readonly VITE_LANGSYS_PROJECT_ID?: string;
	readonly VITE_LANGSYS_API_KEY?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

export {};
