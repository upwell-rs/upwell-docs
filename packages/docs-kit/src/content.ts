import type { Component } from 'svelte';

import { appliesTo, compileRange, type CompiledRange } from '@upwell/docs-core/applicability';
import type { DocsConfig, DocsVersion } from '@upwell/docs-core/config';
import {
	FALLBACK_ORDER,
	type DocFrontmatter,
	type DocSummary,
	type NavigationNode,
	type SymbolFrontmatter,
	type SymbolPageSummary
} from '@upwell/docs-core/content';
import { buildGuideTree, navigationLeaves } from '@upwell/docs-core/navigation';
import { encodeSourcePath } from '@upwell/docs-core/references';
import {
	groupByPath,
	normalizeVersionPath,
	rejectRedundantSince,
	resolveCandidate,
	type PathCandidate
} from '@upwell/docs-core/overlay';
import { createTopicRegistry, type TopicRegistry } from '@upwell/docs-core/topics';

export interface ManifestEntry {
	readonly relativePath: string;
	readonly file: string;
	readonly frontmatter: Record<string, unknown>;
}

export interface DocsManifest {
	readonly guides: readonly ManifestEntry[];
	readonly symbols: readonly ManifestEntry[];
}

export type ContentLoader = () => Promise<{ readonly default: Component }>;
export type ContentLoaderMap = Readonly<Record<string, ContentLoader | undefined>>;

export interface DocsContentOptions {
	readonly config: DocsConfig;
	readonly manifest: DocsManifest;
	readonly guideModules: ContentLoaderMap;
	readonly symbolModules: ContentLoaderMap;
	readonly basePath: string;
}

export class ContentError extends Error {
	constructor(message: string) {
		super(message);

		this.name = 'ContentError';
	}
}

interface GuideVariant {
	readonly summary: DocSummary;
	readonly range: CompiledRange;
	readonly file: string;
}

interface SymbolVariant {
	readonly summary: SymbolPageSummary;
	readonly range: CompiledRange;
	readonly file: string;
}

export interface DocsContent {
	readonly config: DocsConfig;
	readonly topics: TopicRegistry;
	readonly slugs: readonly string[];
	readonly symbolPageSegments: readonly string[];
	pagesFor(releaseVersion: DocsVersion['releaseVersion']): readonly DocSummary[];
	findPage(slug: string, releaseVersion: DocsVersion['releaseVersion']): DocSummary | undefined;
	pageSource(slug: string, releaseVersion: DocsVersion['releaseVersion']): string | undefined;
	loadPage(slug: string, releaseVersion: DocsVersion['releaseVersion']): Promise<Component | undefined>;
	guideLeafOrder(releaseVersion: DocsVersion['releaseVersion']): readonly DocSummary[];
	siblings(slug: string, releaseVersion: DocsVersion['releaseVersion']): { readonly previous?: DocSummary; readonly next?: DocSummary };
	symbolPagesFor(releaseVersion: DocsVersion['releaseVersion']): readonly SymbolPageSummary[];
	findSymbolPage(segments: string, releaseVersion: DocsVersion['releaseVersion']): SymbolPageSummary | undefined;
	symbolPageSource(segments: string, releaseVersion: DocsVersion['releaseVersion']): string | undefined;
	loadSymbolPage(segments: string, releaseVersion: DocsVersion['releaseVersion']): Promise<Component | undefined>;
	navigationFor(version: DocsVersion): readonly NavigationNode[];
	pageHref(versionId: string, slug: string): string;
	symbolHref(source: string, versionId: string, segments: string): string;
	sourceHref(source: string, versionId: string, path: string): string;
}

function path(basePath: string, ...segments: string[]): string {
	return `${basePath}/${segments.join('/')}`.replace(/\/+/g, '/');
}

/** Creates a release-aware content catalog from application-provided manifest and glob maps. */
export function createDocsContent(options: DocsContentOptions): DocsContent {
	const { config, manifest, guideModules, symbolModules, basePath } = options;
	const topics = createTopicRegistry(config.topics);
	const guideVariants = buildGuideVariants(manifest.guides, topics);
	const symbolVariants = buildSymbolVariants(manifest.symbols, topics);

	const pageHref = (versionId: string, slug: string): string => path(basePath, versionId, slug);
	const symbolHref = (source: string, versionId: string, segments: string): string => path(basePath, source, versionId, 'symbols', segments);
	const sourceHref = (source: string, versionId: string, segments: string): string => path(basePath, source, versionId, 'src', segments === '' ? '' : encodeSourcePath(segments));

	function guideVariant(slug: string, releaseVersion: DocsVersion['releaseVersion']): GuideVariant | undefined {
		const variants = guideVariants.get(slug);
		const variant = variants ? resolveCandidate(variants, releaseVersion) : undefined;

		return variant && appliesTo(variant.range, releaseVersion) ? variant : undefined;
	}

	function symbolVariant(segments: string, releaseVersion: DocsVersion['releaseVersion']): SymbolVariant | undefined {
		const variants = symbolVariants.get(segments);
		const variant = variants ? resolveCandidate(variants, releaseVersion) : undefined;

		return variant && appliesTo(variant.range, releaseVersion) ? variant : undefined;
	}

	function pagesFor(releaseVersion: DocsVersion['releaseVersion']): readonly DocSummary[] {
		const pages: DocSummary[] = [];

		for (const slug of guideVariants.keys()) {
			const variant = guideVariant(slug, releaseVersion);

			if (variant) {
				pages.push(variant.summary);
			}
		}

		return pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
	}

	function symbolPagesFor(releaseVersion: DocsVersion['releaseVersion']): readonly SymbolPageSummary[] {
		const pages: SymbolPageSummary[] = [];

		for (const segments of symbolVariants.keys()) {
			const variant = symbolVariant(segments, releaseVersion);

			if (variant) {
				pages.push(variant.summary);
			}
		}

		return pages.sort((a, b) => a.symbol.localeCompare(b.symbol));
	}

	function guideLeafOrder(releaseVersion: DocsVersion['releaseVersion']): readonly DocSummary[] {
		const pages = pagesFor(releaseVersion).filter((page) => !page.draft);
		const summaries = new Map(pages.map((page) => [page.slug, page]));
		const tree = buildGuideTree(pages, (slug) => pageHref('', slug));

		return navigationLeaves(tree).map((leaf) => summaries.get(leaf.id)!);
	}

	return {
		config,
		topics,
		slugs: [...guideVariants.keys()].sort(),
		symbolPageSegments: [...symbolVariants.keys()].sort(),
		pagesFor,
		findPage: (slug, releaseVersion) => guideVariant(slug, releaseVersion)?.summary,
		pageSource: (slug, releaseVersion) => guideVariant(slug, releaseVersion)?.file,
		async loadPage(slug, releaseVersion) {
			const variant = guideVariant(slug, releaseVersion);
			const load = variant ? guideModules[variant.file] : undefined;

			if (!variant) {
				return undefined;
			}

			if (!load) {
				throw new ContentError(
					`The manifest lists ${variant.file}, but no module was found for it. Restart the development server after changing content paths.`
				);
			}

			return (await load()).default;
		},
		guideLeafOrder,
		siblings(slug, releaseVersion) {
			const visible = guideLeafOrder(releaseVersion);
			const position = visible.findIndex((page) => page.slug === slug);

			return position === -1 ? {} : { previous: visible[position - 1], next: visible[position + 1] };
		},
		symbolPagesFor,
		findSymbolPage: (segments, releaseVersion) => symbolVariant(segments, releaseVersion)?.summary,
		symbolPageSource: (segments, releaseVersion) => symbolVariant(segments, releaseVersion)?.file,
		async loadSymbolPage(segments, releaseVersion) {
			const variant = symbolVariant(segments, releaseVersion);
			const load = variant ? symbolModules[variant.file] : undefined;

			return load ? (await load()).default : undefined;
		},
		navigationFor(version) {
			return buildGuideTree(
				pagesFor(version.releaseVersion).filter((page) => !page.draft),
				(slug) => pageHref(version.id, slug)
			);
		},
		pageHref,
		symbolHref,
		sourceHref
	};
}

function buildGuideVariants(entries: readonly ManifestEntry[], topics: TopicRegistry): Map<string, PathCandidate<GuideVariant>[]> {
	return groupByPath(
		entries.map((entry) => {
			const normalized = normalizeVersionPath(entry.relativePath, 'Guide');
			const frontmatter = entry.frontmatter as Partial<DocFrontmatter>;

			if (!frontmatter.title) {
				throw new ContentError(
					`Documentation page is missing a title.\n\n  Page: ${entry.file}\n\nEvery page needs frontmatter with at least:\n\n  ---\n  title: Page title\n  ---\n`
				);
			}

			rejectRedundantSince(normalized.selector, frontmatter.since, `Guide ${entry.file}`);

			const pageTopics = frontmatter.topics ?? [];

			topics.assertKnown(pageTopics, `Page ${entry.file}`);

			return {
				relativePath: entry.relativePath,
				value: {
					summary: {
						slug: normalized.path,
						title: frontmatter.title,
						description: frontmatter.description,
						order: frontmatter.order ?? FALLBACK_ORDER,
						draft: frontmatter.draft ?? false,
						topics: pageTopics
					},
					range: compileRange(frontmatter, `Page ${entry.file}`),
					file: entry.file
				}
			};
		}),
		'Guide'
	);
}

function buildSymbolVariants(entries: readonly ManifestEntry[], topics: TopicRegistry): Map<string, PathCandidate<SymbolVariant>[]> {
	return groupByPath(
		entries.map((entry) => {
			const normalized = normalizeVersionPath(entry.relativePath, 'Symbol page');
			const frontmatter = entry.frontmatter as Partial<SymbolFrontmatter>;
			const symbol = normalized.path.replaceAll('/', '::');

			rejectRedundantSince(normalized.selector, frontmatter.since, `Symbol page ${entry.file}`);

			const pageTopics = frontmatter.topics ?? [];

			topics.assertKnown(pageTopics, `Symbol page ${entry.file}`);

			return {
				relativePath: entry.relativePath,
				value: {
					summary: {
						symbol,
						segments: normalized.path,
						title: frontmatter.title ?? (symbol.split('::').pop() ?? symbol),
						description: frontmatter.description,
						draft: frontmatter.draft ?? false,
						topics: pageTopics
					},
					range: compileRange(frontmatter, `Symbol page ${entry.file}`),
					file: entry.file
				}
			};
		}),
		'Symbol page'
	);
}
