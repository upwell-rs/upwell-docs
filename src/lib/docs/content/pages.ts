/**
 * Loads authored guides.
 *
 * Pages live in `src/content/docs` rather than in the route tree, because content is shared across
 * documented versions — the filesystem cannot own a URL that contains a version. Two mechanisms
 * narrow that, and they answer different questions:
 *
 * - **overlays** (`@0.21.0/…`) — this version says something *different*
 * - **`since` / `until`** — this page *exists* in these versions
 *
 * Both are keyed by **framework version**, not by URL id, because both are usually written before
 * the release they describe exists. See `applies.ts` for why that matters.
 *
 * **Metadata and markup are loaded separately, and that is the point.** Navigation needs every
 * page's frontmatter on every route; only the page being read needs its markup. The frontmatter
 * comes from a build-time manifest that imports nothing, so the components can be code-split behind
 * a lazy glob — where importing metadata from the compiled modules would drag every page's markup
 * into a single chunk. See `tools/docs/content/manifest.ts`.
 */

import type { Component } from 'svelte';

import { manifest } from 'virtual:docs-manifest';

import { appliesTo, type CompiledRange, compileRange } from './applies.ts';
import type { SemVer } from '../version/semver.ts';
import { groupBySlug, resolveVariant, splitOverlay, type Variant } from './overlay.ts';
import { assertKnownTopics } from './topics.ts';
import {
	type DocFrontmatter,
	type DocSection,
	type DocSummary,
	FALLBACK_ORDER,
	FALLBACK_SECTION
} from './types.ts';

/**
 * Every guide's compiled component, behind a lazy loader.
 *
 * Not eager: nothing here is needed until a reader opens a particular page, and the manifest already
 * answers everything navigation asks. Each page becomes its own chunk.
 */
const pageModules = import.meta.glob<{ default: Component }>('/src/content/docs/**/*.svx');

/** A page whose frontmatter is unusable. Raised at build time, during prerendering. */
export class ContentError extends Error {
	constructor(message: string) {
		super(message);

		this.name = 'ContentError';
	}
}

/** One page file, before a version picks between it and its siblings. */
interface PageVariant {
	readonly summary: DocSummary;
	readonly range: CompiledRange;
	/** Project-rooted path, which is the key into the component glob. */
	readonly file: string;
}

function toVariant(file: string, slug: string, frontmatter: Partial<DocFrontmatter>): PageVariant {
	if (!frontmatter.title) {
		throw new ContentError(
			`Documentation page is missing a title.\n\n  Page: ${file}\n\nEvery page needs frontmatter with at least:\n\n  ---\n  title: Page title\n  ---\n`
		);
	}

	const topics = frontmatter.topics ?? [];

	assertKnownTopics(topics, `Page ${file}`);

	return {
		summary: {
			slug,
			title: frontmatter.title,
			description: frontmatter.description,
			section: frontmatter.section ?? FALLBACK_SECTION,
			order: frontmatter.order ?? FALLBACK_ORDER,
			draft: frontmatter.draft ?? false,
			topics
		},
		// Compiled once, at load: a malformed bound is reported here rather than quietly failing to
		// match on every lookup.
		range: compileRange(frontmatter, `Page ${file}`),
		file
	};
}

const variantsBySlug: Map<string, Variant<PageVariant>[]> = buildVariants();

function buildVariants(): Map<string, Variant<PageVariant>[]> {
	return groupBySlug(
		manifest.guides.map((entry) => {
			const { slug } = splitOverlay(entry.relativePath);

			return {
				relativePath: entry.relativePath,
				value: toVariant(entry.file, slug, entry.frontmatter as Partial<DocFrontmatter>)
			};
		}),
		'Content'
	);
}

/**
 * Sidebar order: by section, then by `order` within it, then alphabetically.
 *
 * A section's rank is the lowest `order` any of its pages declares, so promoting a page can promote
 * its whole section — which is what an author expects when they renumber.
 */
function orderPages(summaries: DocSummary[]): DocSummary[] {
	const ranks = new Map<string, number>();

	for (const summary of summaries) {
		const current = ranks.get(summary.section);

		if (current === undefined || summary.order < current) {
			ranks.set(summary.section, summary.order);
		}
	}

	const rankOf = (section: string) => ranks.get(section) ?? FALLBACK_ORDER;

	return summaries.sort((a, b) => {
		if (a.section !== b.section) {
			return rankOf(a.section) - rankOf(b.section) || a.section.localeCompare(b.section);
		}

		return a.order - b.order || a.title.localeCompare(b.title);
	});
}

/** The page variant a version sees for a slug, before `since` / `until` is applied. */
function variantFor(slug: string, frameworkVersion: SemVer): PageVariant | undefined {
	const variants = variantsBySlug.get(slug);

	return variants ? resolveVariant(variants, frameworkVersion) : undefined;
}

/** Guides that apply to one framework version, in sidebar order. */
export function pagesFor(frameworkVersion: SemVer): readonly DocSummary[] {
	const resolved: DocSummary[] = [];

	for (const slug of variantsBySlug.keys()) {
		const variant = variantFor(slug, frameworkVersion);

		if (variant && appliesTo(variant.range, frameworkVersion)) {
			resolved.push(variant.summary);
		}
	}

	return orderPages(resolved);
}

/** Every slug the site has, across all versions. Used for diagnostics, not for navigation. */
export const slugs: readonly string[] = [...variantsBySlug.keys()].sort();

/** Pages grouped into sidebar sections for a version, drafts excluded. */
export function sections(frameworkVersion: SemVer): readonly DocSection[] {
	const grouped = new Map<string, DocSummary[]>();

	for (const page of pagesFor(frameworkVersion)) {
		if (page.draft) {
			continue;
		}

		(grouped.get(page.section) ?? grouped.set(page.section, []).get(page.section)!).push(page);
	}

	return [...grouped].map(([title, group]) => ({ title, pages: group }));
}

/** Guide metadata for a slug, if it applies to the version. */
export function findPage(slug: string, frameworkVersion: SemVer): DocSummary | undefined {
	const variant = variantFor(slug, frameworkVersion);

	return variant && appliesTo(variant.range, frameworkVersion) ? variant.summary : undefined;
}

/**
 * A guide's compiled component for a version, which may come from an overlay.
 *
 * Asynchronous because the component is a separate chunk: this is the import that fetches the page
 * the reader asked for, and nothing else.
 */
export async function loadPage(slug: string, frameworkVersion: SemVer): Promise<Component | undefined> {
	const variant = variantFor(slug, frameworkVersion);

	if (!variant || !appliesTo(variant.range, frameworkVersion)) {
		return undefined;
	}

	const load = pageModules[variant.file];

	if (!load) {
		throw new ContentError(
			`The manifest lists ${variant.file}, but no module was found for it.\n\nThis means the content directory changed without the manifest being rebuilt. Restart the dev server.`
		);
	}

	return (await load()).default;
}

/** Previous and next page in sidebar order, within one version. */
export function siblings(slug: string, frameworkVersion: SemVer): { previous?: DocSummary; next?: DocSummary } {
	const visible = pagesFor(frameworkVersion).filter((page) => !page.draft);
	const position = visible.findIndex((page) => page.slug === slug);

	if (position === -1) {
		return {};
	}

	return { previous: visible[position - 1], next: visible[position + 1] };
}
