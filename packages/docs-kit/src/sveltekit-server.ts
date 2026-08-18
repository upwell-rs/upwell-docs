import type { DocsVersion } from '@upwell/docs-core/config';
import { docsVersions, frameworkCrate, frameworkCrateVersion, resolveVersion as resolveConfiguredVersion, type FrameworkCrateCoordinates } from '@upwell/docs-core/config';
import type { SymbolPageSummary } from '@upwell/docs-core/content';
import type { SearchIndexResponse } from '@upwell/docs-core/search';
import { suggestSymbols } from '@upwell/docs-tools/artifact/load';

import type { DocsContent } from './content.ts';
import type { ArtifactService } from './server/artifact.ts';

export interface ServerRouteError {
	readonly message: string;
	readonly suggestions?: string[];
}

export interface SymbolRecord {
	readonly path: string;
	readonly name: string;
	readonly crate: string;
	readonly kind: string;
	readonly summary: string | null;
	readonly href: string;
	readonly authored: boolean;
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
	symbolEntries(): Promise<{ readonly source: string; readonly version: string; readonly path: string }[]>;
	loadSymbol(params: { readonly source: string; readonly version: string; readonly path: string }): Promise<{
		readonly source: FrameworkCrateCoordinates;
		readonly version: DocsVersion;
		readonly versions: readonly DocsVersion[];
		readonly kind: 'authored' | 'generated';
		readonly page: SymbolPageSummary;
		readonly symbol: NonNullable<Awaited<ReturnType<ArtifactService['getSymbolInfo']>>>;
		readonly docsHtml: string;
		readonly chrome: { readonly slug: string; readonly title: string; readonly section: string; readonly reference: true };
	}>;
	loadSymbolsIndex(sourceId: string, versionId: string): Promise<{
		readonly source: FrameworkCrateCoordinates;
		readonly version: DocsVersion;
		readonly versions: readonly DocsVersion[];
		readonly records: readonly SymbolRecord[];
		readonly sources: readonly { readonly name: string; readonly version: string; readonly href: string }[];
		readonly chrome: { readonly slug: 'symbols'; readonly title: 'Symbols'; readonly section: 'Symbols'; readonly reference: true };
	}>;
	loadSearch(versionId: string): Promise<SearchIndexResponse>;
	searchEntries(): { readonly version: string }[];
	symbolIndexEntries(): { readonly source: string; readonly version: string }[];
} {
	const { content, artifacts, error, building, buildSearchIndex } = options;
	const notFound = (body: ServerRouteError): never => error(404, body);
	const recordsByVersion = new Map<string, Promise<readonly SymbolRecord[]>>();

	function resolveSourceVersion(sourceId: string, id: string): { source: FrameworkCrateCoordinates; version: DocsVersion } {
		const source = frameworkCrate(content.config, sourceId);
		const version = source ? frameworkCrateVersion(source, id) : undefined;

		if (!source || !version) {
			return notFound({ message: `There is no symbol documentation for ${sourceId} version "${id}".` });
		}

		return { source, version };
	}

	function resolveVersion(id: string): DocsVersion {
		const version = resolveConfiguredVersion(content.config, id);

		return version ?? notFound({ message: `There is no documentation for version "${id}".` });
	}

	function symbolRecords(source: FrameworkCrateCoordinates, version: DocsVersion): Promise<readonly SymbolRecord[]> {
		const key = `${source.crate}/${version.id}`;
		const existing = recordsByVersion.get(key);

		if (existing) {
			return existing;
		}

		const loading = artifacts.getCatalog(source, version).then((catalog) => catalog ? catalog.records.filter((record) => record.source === source.crate && record.destination.kind !== 'source').map((record) => ({
			path: record.path,
			name: record.name,
			crate: record.crate,
			kind: record.kind,
			summary: record.summary,
			href: record.destination.href ?? '',
			authored: record.destination.kind === 'authored'
		})) : source === content.config.framework.root ? content.symbolPagesFor(version.releaseVersion).filter((page) => !page.draft).map((page) => ({
			path: page.symbol,
			name: page.title,
			crate: page.symbol.split('::')[0].replaceAll('_', '-'),
			kind: 'page',
			summary: page.description ?? null,
			href: `/docs/${source.crate}/${version.id}/symbols/${page.segments}`,
			authored: true
		})) : []);

		recordsByVersion.set(key, loading);

		return loading;
	}

	return {
		async symbolEntries() {
			const entries: { source: string; version: string; path: string }[] = [];

			for (const source of [content.config.framework.root, ...content.config.framework.crates]) {
				for (const version of source.versions) {
					const catalog = await artifacts.getCatalog(source, version);

					if (!catalog) {
						continue;
					}

					for (const record of catalog.records) {
						if (record.source !== source.crate) {
							continue;
						}

						if (record.destination.kind === 'authored') {
							entries.push({ source: source.crate, version: version.id, path: record.destination.page.segments });
						} else if (record.destination.kind === 'generated') {
							entries.push({ source: source.crate, version: version.id, path: record.destination.segments });
						}
					}
				}
			}

			return entries;
		},
		async loadSymbol(params) {
			const { source, version } = resolveSourceVersion(params.source, params.version);
			const requested = params.path.replaceAll('/', '::');
			const catalog = await artifacts.getCatalog(source, version);
			const record = catalog?.resolve(requested);

			if (!catalog || !record || record.source !== source.crate || record.destination.kind === 'source') {

				return notFound({
					message: `No page documents "${requested}" in ${content.config.framework.name} docs ${version.releaseVersion.raw}.`,
					suggestions: catalog ? suggestSymbols(catalog.artifact, requested).filter((candidate) => catalog.destination(candidate)?.kind !== 'source') : []
				});
			}

			const authored = record.destination.kind === 'authored' ? record.destination.page : undefined;
			const page: SymbolPageSummary = authored ?? { symbol: record.canonical, segments: record.canonical.replaceAll('::', '/'), title: record.name, description: record.summary ?? undefined, draft: false, topics: [] };

			const symbol = await artifacts.getSymbolInfo(source, version, requested);

			if (!symbol) {
				return notFound({ message: `The ${version.releaseVersion.raw} artifact has no symbol "${page.symbol}".` });
			}

			if (building && authored) {
				assertTopicMatchesCrate(content, page, symbol.crate);
			}

			return {
				source,
				version,
				versions: source.versions,
				kind: authored ? 'authored' : 'generated',
				page,
				symbol,
				docsHtml: authored ? '' : await artifacts.getSymbolDocs(source, version, record.canonical),
				chrome: { slug: `symbols/${page.segments}`, title: page.title, section: 'Symbols', reference: true }
			};
		},
		async loadSymbolsIndex(sourceId, versionId) {
			const { source, version } = resolveSourceVersion(sourceId, versionId);
			const records = await symbolRecords(source, version);
			const sources = [content.config.framework.root, ...content.config.framework.crates].map((entry) => {
				const latest = frameworkCrateVersion(entry, entry.latest)!;

				return {
					name: entry.crate,
					version: latest.label,
					href: `/docs/${entry.crate}/${latest.id}/symbols`
				};
			});

			return { source, version, versions: source.versions, records, sources, chrome: { slug: 'symbols', title: 'Symbols', section: 'Symbols', reference: true } };
		},
		async loadSearch(versionId) {
			return buildSearchIndex(resolveVersion(versionId));
		},
		searchEntries: () => docsVersions(content.config).map((version) => ({ version: version.id })),
		symbolIndexEntries: () => [content.config.framework.root, ...content.config.framework.crates].flatMap((source) =>
			source.versions.map((version) => ({ source: source.crate, version: version.id })))
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
