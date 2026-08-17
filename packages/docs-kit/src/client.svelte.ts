import { tick } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';

import { SearchIndex, type SearchStatus } from '@upwell/docs-ui/search';

export type { SearchStatus };

export interface SidebarState {
	readonly groups: {
		isOpen(id: string, fallback: boolean): boolean;
		set(id: string, open: boolean): void;
	};
	readonly topics: {
		readonly active: boolean;
		has(id: string): boolean;
		toggle(id: string): void;
		clear(): void;
		admits(topics: readonly string[]): boolean;
	};
}

export function createSidebarState(storagePrefix = 'docs'): SidebarState {
	const collapsedKey = `${storagePrefix}:collapsed-groups`;
	const expandedKey = `${storagePrefix}:expanded-groups`;
	const topicsKey = `${storagePrefix}:topics`;
	const collapsed = new SvelteSet<string>(read(collapsedKey));
	const expanded = new SvelteSet<string>(read(expandedKey));
	const selected = new SvelteSet<string>(read(topicsKey));

	return {
		groups: {
			isOpen(id, fallback) {
				return collapsed.has(id) ? false : expanded.has(id) || fallback;
			},
			set(id, open) {
				const [add, remove] = open ? [expanded, collapsed] : [collapsed, expanded];

				if (add.has(id) && !remove.has(id)) {
					return;
				}

				add.add(id);
				remove.delete(id);
				write(collapsedKey, collapsed);
				write(expandedKey, expanded);
			}
		},
		topics: {
			get active() {
				return selected.size > 0;
			},
			has: (id) => selected.has(id),
			toggle(id) {
				if (selected.has(id)) {
					selected.delete(id);
				} else {
					selected.add(id);
				}

				write(topicsKey, selected);
			},
			clear() {
				selected.clear();
				write(topicsKey, selected);
			},
			admits(pageTopics) {
				return selected.size === 0 || pageTopics.length === 0 || pageTopics.some((topic) => selected.has(topic));
			}
		}
	};
}

export function createSearchIndex(): SearchIndex {
	return new SearchIndex();
}

interface ToastOptions {
	description?: string;
	duration?: number;
	action?: { readonly label: string; readonly onClick: () => void };
}

export interface DocsNotifier {
	copied(what: string): void;
	copyFailed(): void;
	noPage(path: string, sourceHref?: string | null): void;
	failed(message: string, description?: string): void;
}

export interface NotificationRuntime {
	readonly toaster: { requested: boolean };
	readonly notifier: DocsNotifier;
}

/** Defers the optional toast library until a reader triggers a notification. */
export function createNotificationRuntime(): NotificationRuntime {
	const toaster = $state({ requested: false });
	let loading: Promise<typeof import('svelte-sonner')> | undefined;

	function show(level: 'success' | 'error' | 'info', message: string, options: ToastOptions): void {
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

	return {
		toaster,
		notifier: {
			copied: (what) => show('success', 'Copied', { description: what, duration: 2500 }),
			copyFailed: () => show('error', 'Could not copy', {
				description: 'The browser refused clipboard access. Select the text and copy it manually.',
				duration: 6000
			}),
			noPage: (path, sourceHref) => show('info', 'No page for this symbol', {
				description: `${path} is annotated from the release, but nobody has written a page for it yet.`,
				duration: 6000,
				action: sourceHref ? { label: 'View source', onClick: () => window.open(sourceHref, '_blank', 'noreferrer') } : undefined
			}),
			failed: (message, description) => show('error', message, { description, duration: 6000 })
		}
	};
}

function read(key: string): string[] {
	if (typeof localStorage === 'undefined') {
		return [];
	}

	try {
		const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');

		return Array.isArray(stored) ? stored.filter((entry) => typeof entry === 'string') : [];
	} catch {
		return [];
	}
}

function write(key: string, values: ReadonlySet<string>): void {
	if (typeof localStorage === 'undefined') {
		return;
	}

	try {
		localStorage.setItem(key, JSON.stringify([...values]));
	} catch {
		// Storage can be unavailable without invalidating in-memory interaction state.
	}
}
