/**
 * The search index for one documented release.
 *
 * Two sources, joined here because a reader searching documentation does not distinguish them:
 *
 * - **pages** — guides and symbol pages, with their headings and prose, captured while they compiled
 * - **symbols** — the framework's public surface, from the release's artifact
 *
 * **One record per symbol, keyed by its canonical path.** A symbol is reachable at every path it is
 * re-exported at, and those are different strings for one thing: `framework::component` and
 * `framework::prelude::component` are the same macro. Deduplicating on the *displayed* path instead let
 * a symbol appear twice — once as its hand-written page, once as a bare symbol pointing at a URL
 * with no page behind it, so a search result led to a 404.
 *
 * Built on the server so the raw material never reaches a browser. What ships is this index, which
 * is a fraction of the size: prose is capped per page, and each symbol contributes a name, a path,
 * a kind and a signature rather than its whole record.
 *
 * A release with no prepared artifact still gets a page index. It loses the symbol half, the same
 * way it loses the code lens, rather than losing search entirely.
 */

import path from 'node:path';
import process from 'node:process';

import type { DocsVersion } from '#lib/docs/config';
import { pagesFor } from '#lib/docs/content/pages';
import { symbolPagesFor } from '#lib/docs/content/symbol-pages';
import { indexedDocuments } from '#tools/docs/render/document-index';
import { getArtifact } from './artifact.ts';

/** One searchable entry. */
export interface SearchRecord {
	/** Where selecting it goes. Within the site, unless `external`. */
	readonly href: string;
	readonly title: string;
	/** `guide`, `symbol-page` or `symbol`. */
	readonly kind: 'guide' | 'symbol-page' | 'symbol';
	/** For a symbol, what it is — a struct, a variant, a field. Used to rank incidental ones down. */
	readonly symbolKind?: string;
	/** Secondary line: a description, a symbol path, or the owning crate. */
	readonly detail?: string;
	/** Prose to match against. Absent for a symbol with no page of its own. */
	readonly text?: string;
	/** Section anchors within the page, so a result can point at the right part of it. */
	readonly headings?: readonly { id: string; text: string }[];
	/**
	 * The signature of a symbol nobody has written a page for.
	 *
	 * Shown in the result itself, because there is nowhere on the site to send the reader — and the
	 * alternative, which this replaced, was a link to a page that does not exist.
	 */
	readonly signature?: string;
	/** True when `href` leaves the site: the framework repository, for an undocumented symbol. */
	readonly external?: boolean;
}

export interface SearchIndex {
	readonly version: string;
	readonly records: readonly SearchRecord[];
	/** True when the release had no artifact, so symbols are absent. */
	readonly degraded: boolean;
}

/**
 * Maps a compiled page's source file back to the slug it serves at.
 *
 * The document store is keyed by absolute file path, because that is what the compiler knows. Any
 * overlay prefix is stripped, so an overlay's prose is indexed under the slug it overrides.
 */
function toContentPath(file: string, contentDir: string): string | undefined {
	const relative = path.relative(path.join(process.cwd(), contentDir), file);

	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		return undefined;
	}

	const segments = relative.replace(/\.svx$/, '').split(path.sep);

	return (segments[0]?.startsWith('@') ? segments.slice(1) : segments).join('/');
}

export async function buildSearchIndex(version: DocsVersion): Promise<SearchIndex> {
	const documents = indexedDocuments();
	const guides = new Map<string, (typeof documents)[number]>();
	const symbolDocs = new Map<string, (typeof documents)[number]>();

	for (const document of documents) {
		const guideSlug = toContentPath(document.file, path.join('src', 'content', 'docs'));
		const symbolSegments = toContentPath(document.file, path.join('src', 'content', 'symbols'));

		if (guideSlug !== undefined) {
			guides.set(guideSlug, document);
		} else if (symbolSegments !== undefined) {
			symbolDocs.set(symbolSegments, document);
		}
	}

	const records: SearchRecord[] = [];

	for (const page of pagesFor(version.frameworkVersion)) {
		if (page.draft) {
			continue;
		}

		const document = guides.get(page.slug);

		records.push({
			href: `/docs/${version.id}/${page.slug}`,
			title: page.title,
			kind: 'guide',
			detail: page.description,
			text: document?.text,
			headings: document?.headings.map((heading) => ({ id: heading.id, text: heading.text }))
		});
	}

	const artifact = await getArtifact(version);
	const pages = symbolPagesFor(version.frameworkVersion).filter((page) => !page.draft);

	if (!artifact) {
		// Without an artifact there is no canonical path to key on, so symbol pages are listed as they
		// stand and framework symbols are absent — the same degradation as the code lens.
		for (const page of pages) {
			records.push(fromPage(version, page, symbolDocs.get(page.segments)));
		}

		return { version: version.id, records, degraded: true };
	}

	/**
	 * Symbol pages by the canonical path of the symbol they document.
	 *
	 * A page's location names one path out of several a symbol may be reachable at, so it is resolved
	 * through the index before being used as a key — otherwise a page and its symbol never meet, and
	 * both end up in the results.
	 */
	const pageByCanonical = new Map<string, (typeof pages)[number]>();

	for (const page of pages) {
		pageByCanonical.set(artifact.index.paths[page.symbol] ?? page.symbol, page);
	}

	for (const symbol of artifact.index.symbols) {
		const preferred = preferredPath(artifact.index.paths, symbol.path);
		const page = pageByCanonical.get(symbol.path);

		if (page) {
			records.push({ ...fromPage(version, page, symbolDocs.get(page.segments)), symbolKind: symbol.kind, detail: preferred });

			continue;
		}

		// Nobody has written a page for this symbol, so there is nowhere on the site to send a reader.
		// The result carries the signature and links to source, which is of more use than a 404.
		const source = symbol.source
			? artifact.manifest.sourceLinkTemplate
					.replaceAll('{path}', symbol.source.file)
					.replaceAll('{line}', String(symbol.source.line))
			: undefined;

		records.push({
			href: source ?? `/docs/${version.id}/symbols/${preferred.replaceAll('::', '/')}`,
			title: symbol.name,
			kind: 'symbol',
			symbolKind: symbol.kind,
			detail: preferred,
			signature: symbol.signature ?? undefined,
			external: source !== undefined
		});
	}

	return { version: version.id, records, degraded: false };
}

/** A record for a hand-written symbol page. */
function fromPage(
	version: DocsVersion,
	page: { segments: string; title: string; symbol: string },
	document: { text: string; headings: readonly { id: string; text: string }[] } | undefined
): SearchRecord {
	return {
		href: `/docs/${version.id}/symbols/${page.segments}`,
		title: page.title,
		kind: 'symbol-page',
		detail: page.symbol,
		text: document?.text,
		headings: document?.headings.map((heading) => ({ id: heading.id, text: heading.text }))
	};
}

/** The path a reader would write: fewest segments, then shortest. */
function preferredPath(paths: Readonly<Record<string, string>>, canonical: string): string {
	let best = canonical;

	for (const [reachable, target] of Object.entries(paths)) {
		if (target !== canonical) {
			continue;
		}

		const bySegments = reachable.split('::').length - best.split('::').length;

		if (bySegments < 0 || (bySegments === 0 && reachable.length < best.length)) {
			best = reachable;
		}
	}

	return best;
}
