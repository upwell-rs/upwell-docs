import path from 'node:path';
import process from 'node:process';

import type { DocsVersion } from '@upwell/docs-core/config';
import type { SearchIndexResponse, SearchRecord } from '@upwell/docs-core/search';
import type { LoadedArtifact } from '@upwell/docs-tools/artifact/load';

import type { DocsContent } from '../content.ts';

export interface IndexedDocument {
	readonly file: string;
	readonly headings: readonly { readonly id: string; readonly text: string }[];
	readonly text: string;
}

export interface SearchIndexServiceOptions {
	readonly content: DocsContent;
	readonly documents: () => readonly IndexedDocument[];
	readonly getArtifact: (version: DocsVersion) => Promise<LoadedArtifact | null>;
	readonly projectRoot?: string;
}

export function documentKey(file: string, projectRoot: string = process.cwd()): string {
	return path.resolve(projectRoot, file.slice(1));
}

export function effectiveDocument<T extends { readonly file: string }>(
	documents: readonly T[],
	source: string | undefined,
	projectRoot: string = process.cwd()
): T | undefined {
	if (!source) {
		return undefined;
	}

	const wanted = documentKey(source, projectRoot);

	return documents.find((document) => path.resolve(document.file) === wanted);
}

export function createSearchIndexService(options: SearchIndexServiceOptions): { build(version: DocsVersion): Promise<SearchIndexResponse> } {
	const { content, documents, getArtifact, projectRoot = process.cwd() } = options;

	return {
		async build(version) {
			const indexed = documents();
			const records: SearchRecord[] = [];

			for (const page of content.pagesFor(version.releaseVersion)) {
				if (page.draft) {
					continue;
				}

				const document = effectiveDocument(indexed, content.pageSource(page.slug, version.releaseVersion), projectRoot);

				records.push({ href: content.pageHref(version.id, page.slug), title: page.title, kind: 'guide', detail: page.description, text: document?.text, headings: document?.headings });
			}

			const artifact = await getArtifact(version);
			const pages = content.symbolPagesFor(version.releaseVersion).filter((page) => !page.draft);

			if (!artifact) {
				for (const page of pages) {
					records.push(fromPage(content, version, page, documentForSymbol(page.segments)));
				}

				return { version: version.id, records, degraded: true };
			}

			const pageByCanonical = new Map<string, (typeof pages)[number]>();

			for (const page of pages) {
				pageByCanonical.set(artifact.index.paths[page.symbol] ?? page.symbol, page);
			}

			for (const symbol of artifact.index.symbols) {
				const preferred = preferredPath(artifact.index.paths, symbol.path);
				const page = pageByCanonical.get(symbol.path);

				if (page) {
					records.push({ ...fromPage(content, version, page, documentForSymbol(page.segments)), symbolKind: symbol.kind, detail: preferred });
					continue;
				}

				const source = symbol.source ? artifact.manifest.sourceLinkTemplate.replaceAll('{path}', symbol.source.file).replaceAll('{line}', String(symbol.source.line)) : undefined;

				records.push({ href: source ?? content.symbolHref(version.id, preferred.replaceAll('::', '/')), title: symbol.name, kind: 'symbol', symbolKind: symbol.kind, detail: preferred, signature: symbol.signature ?? undefined, external: source !== undefined });
			}

			return { version: version.id, records, degraded: false };

			function documentForSymbol(segments: string): IndexedDocument | undefined {
				return effectiveDocument(indexed, content.symbolPageSource(segments, version.releaseVersion), projectRoot);
			}
		}
	};
}

function fromPage(content: DocsContent, version: DocsVersion, page: { readonly segments: string; readonly title: string; readonly symbol: string }, document: IndexedDocument | undefined): SearchRecord {
	return { href: content.symbolHref(version.id, page.segments), title: page.title, kind: 'symbol-page', detail: page.symbol, text: document?.text, headings: document?.headings };
}

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
