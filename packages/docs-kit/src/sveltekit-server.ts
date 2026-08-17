import type { DocsVersion } from '@upwell/docs-core/config';
import type { SymbolPageSummary } from '@upwell/docs-core/content';
import type { SearchIndexResponse } from '@upwell/docs-core/search';
import { suggestSymbols } from '@upwell/docs-tools/artifact/load';

import type { DocsContent } from './content.ts';
import type { ArtifactService } from './server/artifact.ts';

export interface ServerRouteError {
	readonly message: string;
	readonly suggestions?: string[];
}

export interface DocsServerRouteHelpersOptions {
	readonly content: DocsContent;
	readonly artifacts: ArtifactService;
	readonly error: (status: number, body: ServerRouteError) => never;
	readonly building: boolean;
	readonly buildSearchIndex: (version: DocsVersion) => Promise<SearchIndexResponse>;
}

/** Server-route algorithms that keep artifact reads and search construction out of the application tree. */
export function createDocsServerRouteHelpers(options: DocsServerRouteHelpersOptions): {
	symbolEntries(): Promise<{ readonly version: string; readonly path: string }[]>;
	loadSymbol(params: { readonly version: string; readonly path: string }): Promise<{
		readonly version: DocsVersion;
		readonly kind: 'authored' | 'generated';
		readonly page: SymbolPageSummary;
		readonly symbol: NonNullable<Awaited<ReturnType<ArtifactService['getSymbolInfo']>>>;
		readonly docsHtml: string;
		readonly chrome: { readonly slug: string; readonly title: string; readonly section: string; readonly reference: true };
	}>;
	loadApiIndex(versionId: string): Promise<{
		readonly version: DocsVersion;
		readonly records: readonly { readonly path: string; readonly name: string; readonly crate: string; readonly kind: string; readonly summary: string | null; readonly href: string; readonly authored: boolean }[];
		readonly chrome: { readonly slug: 'api'; readonly title: 'API Reference'; readonly section: 'API reference'; readonly reference: true };
	}>;
	loadSearch(versionId: string): Promise<SearchIndexResponse>;
	searchEntries(): { readonly version: string }[];
} {
	const { content, artifacts, error, building, buildSearchIndex } = options;
	const notFound = (body: ServerRouteError): never => error(404, body);

	function resolveVersion(id: string): DocsVersion {
		const wanted = id === 'latest' ? content.config.latest : id;
		const version = content.config.versions.find((candidate) => candidate.id === wanted);

		if (!version) {
			return notFound({ message: `There is no documentation for version "${id}".` });
		}

		return version;
	}

	return {
		async symbolEntries() {
			const entries: { version: string; path: string }[] = [];

			for (const version of content.config.versions) {
				const catalog = await artifacts.getCatalog(version);

				if (!catalog) {
					continue;
				}

				for (const record of catalog.records) {
					if (record.destination.kind !== 'source') {
						entries.push({ version: version.id, path: record.destination.kind === 'authored' ? record.destination.page.segments : record.destination.segments });
					}
				}
			}

			return entries;
		},
		async loadSymbol(params) {
			const version = resolveVersion(params.version);
			const requested = params.path.replaceAll('/', '::');
			const catalog = await artifacts.getCatalog(version);
			const record = catalog?.resolve(requested);

			if (!catalog || !record || record.destination.kind === 'source') {

				return notFound({
					message: `No page documents "${requested}" in ${content.config.framework.name} docs ${version.releaseVersion.raw}.`,
					suggestions: catalog ? suggestSymbols(catalog.artifact, requested).filter((candidate) => catalog.destination(candidate)?.kind !== 'source') : []
				});
			}

			const authored = record.destination.kind === 'authored' ? record.destination.page : undefined;
			const page: SymbolPageSummary = authored ?? { symbol: record.canonical, segments: record.canonical.replaceAll('::', '/'), title: record.name, description: record.summary ?? undefined, draft: false, topics: [] };

			const symbol = await artifacts.getSymbolInfo(version, requested);

			if (!symbol) {
				return notFound({ message: `The ${version.releaseVersion.raw} artifact has no symbol "${page.symbol}".` });
			}

			if (building && authored) {
				assertTopicMatchesCrate(content, page, symbol.crate);
			}

			return {
				version,
				kind: authored ? 'authored' : 'generated',
				page,
				symbol,
				docsHtml: authored ? '' : await artifacts.getSymbolDocs(version, record.canonical),
				chrome: { slug: `symbols/${page.segments}`, title: page.title, section: 'API reference', reference: true }
			};
		},
		async loadApiIndex(versionId) {
			const version = resolveVersion(versionId);
			const catalog = await artifacts.getCatalog(version);
			const records = catalog ? catalog.records.filter((record) => record.destination.kind !== 'source').map((record) => ({
				path: record.path,
				name: record.name,
				crate: record.crate,
				kind: record.kind,
				summary: record.summary,
				href: record.destination.href ?? '',
				authored: record.destination.kind === 'authored'
			})) : content.symbolPagesFor(version.releaseVersion).filter((page) => !page.draft).map((page) => ({
				path: page.symbol,
				name: page.title,
				crate: page.symbol.split('::')[0].replaceAll('_', '-'),
				kind: 'page',
				summary: page.description ?? null,
				href: content.symbolHref(version.id, page.segments),
				authored: true
			}));

			return { version, records, chrome: { slug: 'api', title: 'API Reference', section: 'API reference', reference: true } };
		},
		async loadSearch(versionId) {
			return buildSearchIndex(resolveVersion(versionId));
		},
		searchEntries: () => content.config.versions.map((version) => ({ version: version.id }))
	};
}

function assertTopicMatchesCrate(content: DocsContent, page: SymbolPageSummary, crate: string): void {
	const expected = content.topics.forCrate(crate);

	if (!expected || page.topics.includes(expected.id)) {
		return;
	}

	throw new Error(
		`Symbol page declares topics inconsistent with its owning crate.\n\n  Crate:     ${crate} (topic "${expected.id}")\n` +
			`  Declared:  ${page.topics.length > 0 ? page.topics.join(', ') : 'none'}\n`
	);
}
