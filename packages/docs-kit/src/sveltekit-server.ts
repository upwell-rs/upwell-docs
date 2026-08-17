import { isSymbolEnrichmentEligible, type DocsVersion } from '@upwell/docs-core/config';
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
		readonly page: SymbolPageSummary;
		readonly symbol: NonNullable<Awaited<ReturnType<ArtifactService['getSymbolInfo']>>>;
		readonly chrome: { readonly slug: string; readonly title: string; readonly section: string; readonly reference: true };
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
				if (!isSymbolEnrichmentEligible(content.config, version) || !(await artifacts.getArtifact(version))) {
					continue;
				}

				for (const page of content.symbolPagesFor(version.releaseVersion)) {
					entries.push({ version: version.id, path: page.segments });
				}
			}

			return entries;
		},
		async loadSymbol(params) {
			const version = resolveVersion(params.version);
			const page = content.findSymbolPage(params.path, version.releaseVersion);

			if (!isSymbolEnrichmentEligible(content.config, version)) {
				return notFound({ message: `${version.releaseVersion.raw} publishes authored guides without API symbol pages.` });
			}

			if (!page) {
				const artifact = await artifacts.getArtifact(version);
				const requested = params.path.replaceAll('/', '::');

				return notFound({
					message: `No page documents "${requested}" in ${content.config.framework.name} docs ${version.releaseVersion.raw}.`,
					suggestions: artifact ? suggestSymbols(artifact, requested).filter((candidate) => Boolean(content.findSymbolPage(candidate.replaceAll('::', '/'), version.releaseVersion))) : []
				});
			}

			const symbol = await artifacts.getSymbolInfo(version, page.symbol);

			if (!symbol) {
				return notFound({ message: `The ${version.releaseVersion.raw} artifact has no symbol "${page.symbol}".` });
			}

			if (building) {
				assertTopicMatchesCrate(content, page, symbol.crate);
			}

			return {
				version,
				page,
				symbol,
				chrome: { slug: `symbols/${page.segments}`, title: page.title, section: 'API reference', reference: true }
			};
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
