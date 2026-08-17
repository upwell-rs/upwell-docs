/**
 * Loads authored guides.
 *
 * Pages live in `src/content/docs` rather than in the route tree, because content is shared across
 * documented versions — the filesystem cannot own a URL that contains a version. Two mechanisms
 * narrow that, and they answer different questions:
 *
 * - **SemVer directories** (`0.21.0/…`) — this version says something *different*
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
import { buildGuideTree, navigationLeaves } from './navigation-tree.ts';
import type { SemVer } from '../version/semver.ts';
import { groupByPath, normalizeVersionPath, rejectRedundantSince, resolveCandidate, type PathCandidate } from './overlay.ts';
import { assertKnownTopics } from './topics.ts';
import {
	type DocFrontmatter,
	type DocSummary,
	FALLBACK_ORDER
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

const variantsBySlug: Map<string, PathCandidate<PageVariant>[]> = buildVariants();

function buildVariants(): Map<string, PathCandidate<PageVariant>[]> {
	return groupByPath(manifest.guides.map((entry) => {
		const normalized = normalizeVersionPath(entry.relativePath, 'Guide');
		const frontmatter = entry.frontmatter as Partial<DocFrontmatter>;

		rejectRedundantSince(normalized.selector, frontmatter.since, `Guide ${entry.file}`);

		return {
			relativePath: entry.relativePath,
			value: toVariant(entry.file, normalized.path, frontmatter)
		};
	}), 'Guide');
}

function orderPages(summaries: DocSummary[]): DocSummary[] {
	return summaries.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/** The selector winner a version sees for a slug, before its frontmatter is applied. */
function variantFor(slug: string, releaseVersion: SemVer): PageVariant | undefined {
	const variants = variantsBySlug.get(slug);

	const variant = variants ? resolveCandidate(variants, releaseVersion) : undefined;

	return variant;
}

/** Guides that apply to one framework version, in sidebar order. */
export function pagesFor(releaseVersion: SemVer): readonly DocSummary[] {
	const resolved: DocSummary[] = [];

	for (const slug of variantsBySlug.keys()) {
		const variant = variantFor(slug, releaseVersion);

		if (variant && appliesTo(variant.range, releaseVersion)) {
			resolved.push(variant.summary);
		}
	}

	return orderPages(resolved);
}

/** Every slug the site has, across all versions. Used for diagnostics, not for navigation. */
export const slugs: readonly string[] = [...variantsBySlug.keys()].sort();

/** Guide metadata for a slug, if it applies to the version. */
export function findPage(slug: string, releaseVersion: SemVer): DocSummary | undefined {
	const variant = variantFor(slug, releaseVersion);

	return variant && appliesTo(variant.range, releaseVersion) ? variant.summary : undefined;
}

/** Exact source file selected for a slug and release, used by the search document index. */
export function pageSource(slug: string, releaseVersion: SemVer): string | undefined {
	const variant = variantFor(slug, releaseVersion);

	return variant && appliesTo(variant.range, releaseVersion) ? variant.file : undefined;
}

/**
 * A guide's compiled component for a version, which may come from an overlay.
 *
 * Asynchronous because the component is a separate chunk: this is the import that fetches the page
 * the reader asked for, and nothing else.
 */
export async function loadPage(slug: string, releaseVersion: SemVer): Promise<Component | undefined> {
	const variant = variantFor(slug, releaseVersion);

	if (!variant || !appliesTo(variant.range, releaseVersion)) {
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

/** Previous and next guide in depth-first navigation-tree leaf order. */
export function siblings(slug: string, releaseVersion: SemVer): { previous?: DocSummary; next?: DocSummary } {
	const visible = guideLeafOrder(releaseVersion);
	const position = visible.findIndex((page) => page.slug === slug);

	if (position === -1) {
		return {};
	}

	return { previous: visible[position - 1], next: visible[position + 1] };
}

/** Visible guides in the same depth-first order as the recursive sidebar. */
export function guideLeafOrder(releaseVersion: SemVer): readonly DocSummary[] {
	const pages = pagesFor(releaseVersion).filter((page) => !page.draft);
	const summaries = new Map(pages.map((page) => [page.slug, page]));

	return navigationLeaves(buildGuideTree(pages, '')).map((leaf) => summaries.get(leaf.id)!);
}
