/**
 * The site's notification vocabulary.
 *
 * Two jobs, and the second is why this is not simply a re-export of the toast library.
 *
 * **It names events rather than appearances.** `notify.copied('cargo add framework')` reads as the
 * thing that happened, and the decision that a confirmation is brief while a failure lingers is made
 * once, here, instead of at each of the several places that copy something.
 *
 * **It loads the toast machinery only when a toast is actually wanted.** Toasts are purely a
 * response to interaction — a copy, a failure — so nothing on a page a reader merely *reads* needs
 * them. Importing the library statically put it in the shell chunk that every visitor downloads
 * before seeing a word of documentation, to support something most visits never trigger. The dynamic
 * import moves that cost to the first notification, which by definition is after the page is up.
 *
 * The public methods stay synchronous. A caller reporting that a copy failed should not have to
 * await the reporting, and there is nothing useful for it to do with the promise.
 */

import { tick } from 'svelte';

/** How long a message that merely confirms stays up, in milliseconds. */
const CONFIRMATION = 2500;

/**
 * A failure stays longer than a confirmation.
 *
 * A reader who succeeded already knows; a reader whose action silently failed has to notice the
 * toast at all before they can understand it.
 */
const FAILURE = 6000;

/** Options accepted here, which is the subset of the library's that this site uses. */
interface ToastOptions {
	description?: string;
	duration?: number;
	action?: { label: string; onClick: () => void };
}

type Level = 'success' | 'error' | 'info';

/**
 * Whether the host component should mount.
 *
 * Read by `Notifications.svelte`. It starts false, so the toaster is absent from the page until
 * something asks for it.
 */
export const toaster = $state({ requested: false });

let loading: Promise<typeof import('svelte-sonner')> | undefined;

/**
 * Shows a toast, loading the library and mounting the host if this is the first one.
 *
 * The host has to exist before the toast is raised, or the first notification is queued into a
 * component that is not listening yet — hence the `tick`, which lets the mount triggered by
 * `requested` happen before the call.
 */
function show(level: Level, message: string, options: ToastOptions): void {
	void (async () => {
		loading ??= import('svelte-sonner');

		const { toast } = await loading;

		if (!toaster.requested) {
			toaster.requested = true;

			await tick();
		}

		toast[level](message, options);
	})();
}

export const notify = {
	/** Something was copied to the clipboard. */
	copied(what: string): void {
		show('success', 'Copied', { description: what, duration: CONFIRMATION });
	},

	/**
	 * A clipboard write was refused.
	 *
	 * Clipboard writes genuinely fail — an insecure origin, a denied permission — and the failure is
	 * invisible otherwise: the reader walks away believing they have the command.
	 */
	copyFailed(): void {
		show('error', 'Could not copy', {
			description: 'The browser refused clipboard access. Select the text and copy it manually.',
			duration: FAILURE
		});
	},

	/**
	 * A symbol the reader asked about has no page on this site.
	 *
	 * Most symbols have no page and are not meant to; saying so, with the path, is more use than a
	 * navigation to a 404.
	 */
	noPage(path: string, sourceHref?: string | null): void {
		show('info', 'No page for this symbol', {
			description: `${path} is annotated from the release, but nobody has written a page for it yet.`,
			duration: FAILURE,
			action: sourceHref ? { label: 'View source', onClick: () => window.open(sourceHref, '_blank', 'noreferrer') } : undefined
		});
	},

	/** Something failed that the reader should know about but cannot act on. */
	failed(message: string, description?: string): void {
		show('error', message, { description, duration: FAILURE });
	}
};
