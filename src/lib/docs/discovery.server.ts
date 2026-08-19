/**
 * What this site publishes about itself: a sitemap, `robots.txt`, an `llms.txt` index, and a
 * Markdown copy of every guide.
 *
 * Composed here rather than in the packages because every part of it is this application's policy —
 * its URL shapes, its origin, and which of its routes are worth a crawler's attention. The packages
 * supply the enumeration and the rendering.
 */

import { docsVersions, latestVersion, resolveFrameworkReferenceVersion } from '@upwell/docs-core/config';
import { directoryOf, resolveRelativePath } from '@upwell/docs-core/paths';
import { guideSlug, sourceCrate, sourcePath, symbolPath } from '@upwell/docs-core/references';
import { llmsTxt, robotsTxt } from '@upwell/docs-kit/server';
import { markdownFromPageSource, type MarkdownAuthoringReference } from '@upwell/docs-tools/render/markdown-export';

import { docsContent, docsRoutes } from './runtime.ts';
import { docsServerRoutes } from './runtime.server.ts';
import { siteOrigin } from './site.ts';

/**
 * Raw page sources, bundled rather than read from disk.
 *
 * The built server has no `src/content` beside it, so the Markdown copies have to travel inside the
 * bundle. This is the same glob the page components use, asked for the text instead of the component.
 */
const guideSources = import.meta.glob<string>('/src/content/docs/**/*.svx', { query: '?raw', import: 'default' });

/** Every guide of every documented release, newest release first. */
function guideEntries(): { readonly version: string; readonly slug: string; readonly title: string; readonly description?: string }[] {
	return docsVersions(docsContent.config).flatMap((version) =>
		docsContent
			.pagesFor(version.releaseVersion)
			.filter((page) => !page.draft)
			.map((page) => ({ version: version.id, slug: page.slug, title: page.title, description: page.description }))
	);
}

/**
 * Values for every parameterized page route, keyed the way super-sitemap keys them.
 *
 * This is the half a library cannot do: which releases exist, which guides each one has, and which
 * symbols the artifacts documented. What it does do is refuse to build a sitemap while a route on
 * disk has neither values here nor an exclusion — so a new route family cannot quietly go unlisted,
 * which is the failure a hand-written list makes silently.
 */
export async function sitemapParamValues(): Promise<Record<string, string[][]>> {
	const guides = guideEntries().map((entry) => [entry.version, entry.slug]);
	const symbolIndexes = docsServerRoutes.symbolIndexEntries().map((entry) => [entry.source, entry.version]);
	const symbols = (await docsServerRoutes.symbolEntries()).map((entry) => [entry.source, entry.version, entry.path]);

	return {
		'/docs/[version]/[...slug]': guides,
		'/docs/[version]/[sourceVersion]/symbols': symbolIndexes,
		'/docs/[version]/[sourceVersion]/symbols/[...path]': symbols
	};
}

/**
 * Route families a sitemap should not list.
 *
 * The redirects are not canonical URLs — `/`, `/docs`, `/docs/latest/…` and the unscoped symbol paths
 * all send the reader somewhere else, and that somewhere else is already listed. The repository
 * browser is left out for a different reason: its pages are one per file in the framework's history,
 * enumerated over the network, and none of them is documentation prose.
 */
export const sitemapExclusions: readonly RegExp[] = [
	/^\/$/,
	/^\/docs$/,
	/^\/docs\/latest(?:$|\/)/,
	/^\/docs\/\[version\]\/symbols(?:$|\/)/,
	/^\/docs\/\[version\]\/\[sourceVersion\]\/src(?:$|\/)/
];

export function robots(): string {
	// The JSON payloads the application fetches for itself are not pages; a crawler reading them finds
	// data it cannot render and spends budget it could have spent on prose.
	return robotsTxt(siteOrigin, ['/docs/*/search.json', '/docs/*/symbols.json', '/api/']);
}

export function llms(): string {
	const latest = latestVersion(docsContent.config);
	const guides = guideEntries().filter((entry) => entry.version === latest.id);
	const name = docsContent.config.framework.name;

	return llmsTxt(siteOrigin, {
		title: `${name} documentation`,
		summary: `Documentation for ${name} ${latest.label}: guides written for people, and a generated API reference for every symbol in the release.`,
		notes: [
			`Every guide below links to its Markdown source. The rendered page is the same path under \`/docs\`, without the \`.md\`.`,
			`The API reference is large and machine-readable elsewhere: \`/docs/${latest.id}/symbols.json\` lists every documented symbol, and \`/docs/${latest.id}/search.json\` is the full search index.`
		],
		sections: [
			{
				title: `Guides (${latest.label})`,
				links: guides.map((entry) => ({
					title: entry.title,
					path: markdownPath(entry.version, entry.slug),
					description: entry.description
				}))
			},
			{
				title: 'Reference',
				links: [
					{ title: 'Symbol index', path: docsContent.symbolHref(docsContent.config.framework.root.crate, latest.id, '').replace(/\/$/, ''), description: 'Every documented symbol in this release.' },
					{ title: 'Repository source', path: docsContent.sourceHref(docsContent.config.framework.root.crate, latest.id, ''), description: 'The framework source at the revision this release documents.' }
				]
			},
			{
				title: 'Other releases',
				links: docsVersions(docsContent.config)
					.filter((version) => version.id !== latest.id)
					.map((version) => ({ title: version.label, path: docsContent.pageHref(version.id, docsContent.config.landingSlug), description: `Documentation for ${version.label}.` }))
			}
		]
	});
}

/**
 * URL of one guide's Markdown copy.
 *
 * The `.md` suffix is not decoration. A group's own page and its children share a path — `cargo-upwell`
 * is a page and a directory both — and a static host cannot write a file and a directory at one name.
 * The suffix is also what the convention expects a Markdown copy to look like.
 */
function markdownPath(versionId: string, slug: string): string {
	return `/llms/${versionId}/${slug}.md`;
}

/**
 * The Markdown behind one guide, or undefined when that release has no such page.
 *
 * The source is loaded on demand rather than eagerly: one page is asked for at a time, and bundling
 * every page's text into the server's start-up graph to answer that would be a poor trade.
 */
export async function guideMarkdown(versionId: string, requested: string): Promise<string | undefined> {
	const slug = requested.replace(/\.md$/, '');
	const version = docsRoutes.resolveVersion(versionId);
	const page = docsContent.findPage(slug, version.releaseVersion);
	const file = page ? docsContent.pageSource(slug, version.releaseVersion) : undefined;
	const load = file ? guideSources[file] : undefined;

	if (!load) {
		return undefined;
	}

	// The exported copies link each other, so a neighbour's slug has to name the copy rather than the
	// page: only the `.md` variants are published under `/llms`. Which destinations are pages at all is
	// something only this side knows — a guide may just as well link a file — so the exporter asks.
	const directory = directoryOf(slug);

	return markdownFromPageSource(await load(), {
		relativeLinkSuffix: '.md',
		referenceHref: (reference) => exportedReferenceHref(reference, version),
		exports: (destination) => {
			const target = resolveRelativePath(directory, destination);

			return Boolean(target && docsContent.findPage(target, version.releaseVersion));
		}
	});
}

function exportedReferenceHref(reference: MarkdownAuthoringReference, activeVersion: ReturnType<typeof docsRoutes.resolveVersion>): string {
	if (reference.kind === 'guide') {
		return `${markdownPath(activeVersion.id, guideSlug(reference.slug))}${reference.fragment ? `#${reference.fragment}` : ''}`;
	}

	const target = resolveFrameworkReferenceVersion(docsContent.config, {
		source: reference.source === undefined ? undefined : sourceCrate(reference.source),
		version: reference.version,
		activeSource: docsContent.config.framework.root.crate,
		activeVersion
	});

	if (!target) {
		throw new Error(`Unknown documentation source or version in exported ${reference.kind} reference.`);
	}

	return reference.kind === 'symbol'
		? docsContent.symbolHref(target.source.crate, target.version.id, symbolPath(reference.path))
		: docsContent.sourceHref(target.source.crate, target.version.id, sourcePath(reference.path));
}

/** Every guide that has a Markdown copy, for prerendering them all. */
export function guideMarkdownEntries(): { readonly version: string; readonly slug: string }[] {
	return guideEntries().map((entry) => ({ version: entry.version, slug: `${entry.slug}.md` }));
}
