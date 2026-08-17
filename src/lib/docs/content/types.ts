/**
 * The documentation content model.
 *
 * One typed representation of a page, used by routing, navigation, breadcrumbs and symbol linking
 * alike. Everything that reads page metadata reads these types, so a new frontmatter field is added
 * in one place rather than being invented ad hoc per consumer.
 *
 * There are two kinds of page:
 *
 * - **guides**, in `src/content/docs`, addressed by slug
 * - **symbol pages**, in `src/content/symbols`, addressed by the symbol they document
 *
 * Both are written by hand. Neither is generated.
 */

import type { Component } from 'svelte';

import type { VersionRange } from './applies.ts';

/** Frontmatter any page may declare. */
interface CommonFrontmatter extends VersionRange {
	readonly description?: string;
	/** Hide from navigation while keeping the page reachable. */
	readonly draft?: boolean;
}

/** Frontmatter for a guide. Only `title` is required. */
export interface DocFrontmatter extends CommonFrontmatter {
	readonly title: string;
	/**
	 * Subjects this page belongs to, for sidebar filtering.
	 *
	 * Ids from `topics.ts`; an unknown one fails the build. A page with none is always shown, since
	 * an unclassified page is more likely to be general than to be irrelevant.
	 */
	readonly topics?: readonly string[];
	/** Sort key among pages and child groups. Pages without one sort last, then alphabetically. */
	readonly order?: number;
}

/**
 * Frontmatter for a symbol page.
 *
 * The symbol itself is not declared here — it is the file's location under
 * `src/content/symbols`, so `framework/prelude/component.svx` documents `framework::prelude::component`.
 * Encoding it in the path means the build can find which symbols have pages by listing a directory,
 * without reading or parsing any frontmatter, and it makes the URL and the file mirror each other.
 */
export interface SymbolFrontmatter extends CommonFrontmatter {
	/** Heading for the page. Defaults to the symbol's last path segment. */
	readonly title?: string;
	/**
	 * Subjects this page belongs to, for sidebar filtering.
	 *
	 * Declared rather than derived, because the sidebar filters without the artifact loaded and the
	 * symbol's crate is only known to the build. The build checks the declaration against that crate
	 * and fails on disagreement, so it is explicit without being able to drift.
	 */
	readonly topics?: readonly string[];
}

/** Guide metadata, without the component. */
export interface DocSummary {
	readonly slug: string;
	readonly title: string;
	readonly description?: string;
	readonly order: number;
	readonly draft: boolean;
	readonly topics: readonly string[];
}

/** Symbol page metadata, without the component. */
export interface SymbolPageSummary {
/** Symbol path as written in the file's location, e.g. `framework::prelude::component`. */
	readonly symbol: string;
/** URL segment form, e.g. `framework/prelude/component`. */
	readonly segments: string;
	readonly title: string;
	readonly description?: string;
	readonly draft: boolean;
	/** Derived from the symbol's crate rather than declared — see `topics.ts`. */
	readonly topics: readonly string[];
}

/** A loaded page and its compiled component. */
export interface LoadedPage<Summary> {
	readonly summary: Summary;
	readonly component: Component;
}

/**
 * What the documentation shell needs from whichever page is being rendered.
 *
 * A layout cannot be handed props by the page below it, so both routes return this and the layout
 * reads it from the merged page data. Normalising here is what lets the shell treat a guide and a
 * symbol page alike without inspecting the URL to tell them apart.
 */
export interface PageChrome {
	/** Sidebar key: a guide's slug, or `symbols/<path>` for a symbol page. */
	readonly slug: string;
	readonly title: string;
	readonly section: string;
	/** True for reference material, which sits outside the guide sequence. */
	readonly reference: boolean;
}

export interface NavigationPage {
	readonly type: 'page';
	readonly id: string;
	readonly title: string;
	readonly href: string;
	readonly order: number;
	readonly topics: readonly string[];
	readonly reference: boolean;
}

export interface NavigationGroup {
	readonly type: 'group';
	readonly id: string;
	readonly label: string;
	readonly order: number;
	readonly defaultOpen: boolean;
	readonly kind: 'guide' | 'reference';
	readonly children: readonly NavigationNode[];
}

export type NavigationNode = NavigationGroup | NavigationPage;

/** A heading extracted from a rendered page, for the table of contents. */
export interface DocHeading {
	readonly id: string;
	readonly text: string;
	/** 2 or 3. `h1` is the page title and is never listed. */
	readonly depth: 2 | 3;
}

/** Sort key for pages that declare no order. */
export const FALLBACK_ORDER = Number.MAX_SAFE_INTEGER;
