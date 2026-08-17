import path from 'node:path';
import process from 'node:process';

import type { DocsVersion } from '@upwell/docs-core/config';
import type { SearchIndexResponse, SearchRecord } from '@upwell/docs-core/search';
import type { DocsContent } from '../content.ts';
import type { SymbolCatalog } from './artifact.ts';

export interface IndexedDocument {
	readonly file: string;
	readonly headings: readonly { readonly id: string; readonly text: string }[];
	readonly text: string;
}

export interface SearchIndexServiceOptions {
	readonly content: DocsContent;
	readonly documents: () => readonly IndexedDocument[];
	readonly getCatalog: (version: DocsVersion) => Promise<SymbolCatalog | null>;
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
	const { content, documents, getCatalog, projectRoot = process.cwd() } = options;

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

			const catalog = await getCatalog(version);
			const pages = content.symbolPagesFor(version.releaseVersion).filter((page) => !page.draft);

			if (!catalog) {
				for (const page of pages) {
					records.push(fromPage(content, version, page, documentForSymbol(page.segments)));
				}

				return { version: version.id, records, degraded: true };
			}

			for (const record of catalog.records) {
				if (record.destination.kind === 'authored') {
					const page = record.destination.page;
					records.push({ ...fromPage(content, version, page, documentForSymbol(page.segments)), symbolKind: record.kind, detail: record.path });
					continue;
				}

				if (record.destination.kind === 'source') {
					if (record.destination.href) {
						records.push({ href: record.destination.href, title: record.name, kind: 'symbol', symbolKind: record.kind, detail: record.path, signature: record.signature ?? undefined, external: true });
					}

					continue;
				}

				records.push({ href: record.destination.href, title: record.name, kind: 'symbol', symbolKind: record.kind, detail: record.path, signature: record.signature ?? undefined, text: record.summary ?? undefined });
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
