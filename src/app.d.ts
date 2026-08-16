// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		/**
		 * Error shape shared by every route.
		 *
		 * `suggestions` carries near-miss symbol paths from the API reference route, so the error page
		 * can offer them as links instead of leaving a reader at a dead end.
		 */
		interface Error {
			message: string;
			suggestions?: string[];
		}
	}
}

export {};
