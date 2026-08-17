/**
 * Sidebar state the reader controls: which groups are collapsed, and which topics are shown.
 *
 * Kept across navigations, and across visits: a reader who folded away a section they are not
 * working in, or narrowed the sidebar to HTTP, should not have to do it again on the next page.
 *
 * Persistence is best-effort. `localStorage` throws in private modes and when storage is blocked,
 * and a sidebar that fails to work because of a storage policy would be a poor trade — so a failure
 * to read or write leaves the state in memory and says nothing.
 */

import { SvelteSet } from 'svelte/reactivity';

const COLLAPSED_KEY = 'framework-docs:collapsed-groups';
const EXPANDED_KEY = 'framework-docs:expanded-groups';
const TOPICS_KEY = 'framework-docs:topics';

/**
 * Which sidebar groups are open.
 *
 * Three states rather than two, which is what having per-group *defaults* requires: a group the
 * reader collapsed, a group the reader opened, and one they have never touched. Storing only
 * "collapsed" would make a default-collapsed group impossible to distinguish from one the reader
 * deliberately closed, so opening it once could never stick.
 */
class GroupState {
	/** `SvelteSet` rather than `$state(new Set())`: mutating a plain Set is not reactive. */
	readonly #collapsed = new SvelteSet<string>(read(COLLAPSED_KEY));
	readonly #expanded = new SvelteSet<string>(read(EXPANDED_KEY));

	/** Whether a group should render open, given what it would do untouched. */
	isOpen(id: string, fallback: boolean): boolean {
		if (this.#collapsed.has(id)) {
			return false;
		}

		if (this.#expanded.has(id)) {
			return true;
		}

		return fallback;
	}

	set(id: string, collapsed: boolean): void {
		const [add, remove] = collapsed ? [this.#collapsed, this.#expanded] : [this.#expanded, this.#collapsed];

		if (add.has(id) && !remove.has(id)) {
			return;
		}

		add.add(id);
		remove.delete(id);

		write(COLLAPSED_KEY, this.#collapsed);
		write(EXPANDED_KEY, this.#expanded);
	}
}

/**
 * Topics the reader has narrowed to.
 *
 * Empty means **everything**, not nothing — the natural reading of an untouched filter, and the
 * only one that leaves a first-time reader with a full sidebar.
 */
class TopicFilter {
	readonly #selected = new SvelteSet<string>(read(TOPICS_KEY));

	get active(): boolean {
		return this.#selected.size > 0;
	}

	get selected(): ReadonlySet<string> {
		return this.#selected;
	}

	has(id: string): boolean {
		return this.#selected.has(id);
	}

	toggle(id: string): void {
		if (this.#selected.has(id)) {
			this.#selected.delete(id);
		} else {
			this.#selected.add(id);
		}

		write(TOPICS_KEY, this.#selected);
	}

	clear(): void {
		this.#selected.clear();
		write(TOPICS_KEY, this.#selected);
	}

	/**
	 * Whether a page survives the filter.
	 *
	 * A page with no topics is always shown. An unclassified page is far more likely to be general —
	 * an index, a changelog — than to be irrelevant to every subject, and hiding it would make the
	 * filter feel broken.
	 */
	admits(topics: readonly string[]): boolean {
		if (!this.active || topics.length === 0) {
			return true;
		}

		return topics.some((topic) => this.#selected.has(topic));
	}
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
		// Storage is unavailable or full. The state stays in memory for this session.
	}
}

export const groupState = new GroupState();
export const topicFilter = new TopicFilter();
