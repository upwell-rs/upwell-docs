/** Pure content contracts shared by documentation catalogs, routes, and presentation. */

import type { VersionRange } from './applicability.ts';

interface CommonFrontmatter extends VersionRange {
	readonly description?: string;
	readonly draft?: boolean;
}

export interface DocFrontmatter extends CommonFrontmatter {
	readonly title: string;
	readonly topics?: readonly string[];
	readonly order?: number;
}

export interface SymbolFrontmatter extends CommonFrontmatter {
	readonly title?: string;
	readonly topics?: readonly string[];
}

export interface DocSummary {
	readonly slug: string;
	readonly title: string;
	readonly description?: string;
	readonly order: number;
	readonly draft: boolean;
	readonly topics: readonly string[];
}

export interface SymbolPageSummary {
	readonly symbol: string;
	readonly segments: string;
	readonly title: string;
	readonly description?: string;
	readonly draft: boolean;
	readonly topics: readonly string[];
}

export interface PageChrome {
	readonly slug: string;
	readonly title: string;
	readonly section: string;
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

export interface DocHeading {
	readonly id: string;
	readonly text: string;
	readonly depth: 2 | 3;
}

export const FALLBACK_ORDER = Number.MAX_SAFE_INTEGER;
