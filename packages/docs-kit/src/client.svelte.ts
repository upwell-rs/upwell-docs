import { tick } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';

import { SearchIndex, type SearchStatus } from '@upwell/docs-ui/search';

export type { SearchStatus };

/**
 * Which navigation a remembered sidebar width belongs to.
 *
 * The two are stored separately because they hold different things. A guide title is prose a few
 * words long; a symbol label is a Rust identifier at the bottom of a nested module path. A width
 * that suits one is the wrong width for the other, so widening the reference navigation does not
 * then push the guide navigation out with it.
 */
export type SidebarArea = 'guides' | 'symbols';

/** Narrower than this hides the tree; wider takes space the article needs. */
export const SIDEBAR_MIN_WIDTH = 190;
export const SIDEBAR_MAX_WIDTH = 560;

export const SIDEBAR_DEFAULT_WIDTH: Record<SidebarArea, number> = { guides: 240, symbols: 300 };

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
	readonly width: {
		/** Remembered width in pixels, already clamped to the resizable range. */
		get(area: SidebarArea): number;
		set(area: SidebarArea, pixels: number): void;
	};
}

export function createSidebarState(storagePrefix = 'docs'): SidebarState {
	const collapsedKey = `${storagePrefix}:collapsed-groups`;
	const expandedKey = `${storagePrefix}:expanded-groups`;
	const topicsKey = `${storagePrefix}:topics`;
	const widthKey = (area: SidebarArea): string => `${storagePrefix}:sidebar-width:${area}`;
	const collapsed = new SvelteSet<string>(read(collapsedKey));
	const expanded = new SvelteSet<string>(read(expandedKey));
	const selected = new SvelteSet<string>(read(topicsKey));
	const widthWrites: Partial<Record<SidebarArea, ReturnType<typeof setTimeout>>> = {};

	// Clamped on the way in as well as on the way out: a stored width predates any change to the
	// bounds, and a value from another viewport should not be able to leave the article unreadable.
	const widths = $state<Record<SidebarArea, number>>({
		guides: clampWidth(readNumber(widthKey('guides')) ?? SIDEBAR_DEFAULT_WIDTH.guides),
		symbols: clampWidth(readNumber(widthKey('symbols')) ?? SIDEBAR_DEFAULT_WIDTH.symbols)
	});

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
		},
		width: {
			get: (area) => widths[area],
			set(area, pixels) {
				const next = clampWidth(pixels);

				if (next === widths[area]) {
					return;
				}

				widths[area] = next;
				clearTimeout(widthWrites[area]);
				widthWrites[area] = setTimeout(() => writeNumber(widthKey(area), next), 150);
			}
		}
	};
}

function clampWidth(pixels: number): number {
	if (!Number.isFinite(pixels)) {
		return SIDEBAR_DEFAULT_WIDTH.guides;
	}

	return Math.round(Math.min(Math.max(pixels, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH));
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

function readNumber(key: string): number | undefined {
	if (typeof localStorage === 'undefined') {
		return undefined;
	}

	try {
		const stored = Number(localStorage.getItem(key));

		return Number.isFinite(stored) && stored > 0 ? stored : undefined;
	} catch {
		return undefined;
	}
}

function writeNumber(key: string, value: number): void {
	if (typeof localStorage === 'undefined') {
		return;
	}

	try {
		localStorage.setItem(key, String(value));
	} catch {
		// Storage can be unavailable without invalidating in-memory interaction state.
	}
}
