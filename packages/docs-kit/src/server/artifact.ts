import process from 'node:process';

import { isSymbolEnrichmentEligible, type DocsConfig, type DocsVersion } from '@upwell/docs-core/config';
import type { SymbolPageSummary } from '@upwell/docs-core/content';
import {
	artifactDir,
	findSymbol,
	type LoadedArtifact,
	loadArtifact,
	symbolSourceLink
} from '@upwell/docs-tools/artifact/load';
import { MEMBER_SYMBOL_KINDS, type Symbol } from '@upwell/docs-tools/rustdoc/symbols';
import type { SymbolInfo, SymbolLink, SymbolMember } from '@upwell/docs-ui/types';

export interface ArtifactServiceOptions {
	readonly config: DocsConfig;
	readonly findSymbolPage: (segments: string, releaseVersion: DocsVersion['releaseVersion']) => SymbolPageSummary | undefined;
	readonly symbolHref: (versionId: string, segments: string) => string;
	readonly projectRoot?: string;
}

export interface ArtifactService {
	artifactVersion(version: DocsVersion): string;
	getArtifact(version: DocsVersion): Promise<LoadedArtifact | null>;
	getSymbolInfo(version: DocsVersion, symbolPath: string): Promise<SymbolInfo | undefined>;
}

/** Server-only artifact access. The application injects catalog lookup to keep this package app-neutral. */
export function createArtifactService(options: ArtifactServiceOptions): ArtifactService {
	const { config, findSymbolPage, symbolHref, projectRoot = process.cwd() } = options;
	const cache = new Map<string, Promise<LoadedArtifact | null>>();

	function artifactVersion(version: DocsVersion): string {
		return version.releaseVersion.raw;
	}

	function getArtifact(version: DocsVersion): Promise<LoadedArtifact | null> {
		if (!isSymbolEnrichmentEligible(config, version)) {
			return Promise.resolve(null);
		}

		const key = artifactVersion(version);
		const existing = cache.get(key);

		if (existing) {
			return existing;
		}

		const loading = loadArtifact(artifactDir(projectRoot, config.cacheDir, key), key).catch(() => null);

		cache.set(key, loading);

		return loading;
	}

	async function getSymbolInfo(version: DocsVersion, symbolPath: string): Promise<SymbolInfo | undefined> {
		const artifact = await getArtifact(version);
		const symbol = artifact ? findSymbol(artifact, symbolPath) : undefined;

		if (!artifact || !symbol) {
			return undefined;
		}

		return {
			path: symbolPath,
			canonicalPath: symbol.path,
			name: symbol.name,
			kind: symbol.kind,
			crate: symbol.crate,
			signature: symbol.signature,
			doc: symbol.doc,
			feature: symbol.feature,
			deprecation: symbol.deprecation,
			sourceHref: symbolSourceLink(artifact, symbol),
			source: symbol.source,
			implementations: symbol.implementations,
			implementors: symbol.implementors.map((canonical) => toLink(artifact, version, canonical)),
			members: collectMembers(artifact, symbol)
		};
	}

	function toLink(artifact: LoadedArtifact, version: DocsVersion, canonical: string): SymbolLink {
		const path = preferredPath(artifact, canonical);
		const page = findSymbolPage(path.replaceAll('::', '/'), version.releaseVersion);

		return { path, name: path.split('::').pop() ?? path, href: page ? symbolHref(version.id, page.segments) : null };
	}

	return { artifactVersion, getArtifact, getSymbolInfo };
}

function preferredPath(artifact: LoadedArtifact, canonical: string): string {
	let best = canonical;

	for (const [reachable, target] of Object.entries(artifact.index.paths)) {
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

const MEMBER_ORDER: readonly string[] = ['assoc_type', 'assoc_const', 'struct_field', 'variant', 'assoc_fn', 'method'];

function collectMembers(artifact: LoadedArtifact, owner: Symbol): SymbolMember[] {
	const prefix = `${owner.path}::`;
	const members: { readonly member: SymbolMember; readonly rank: number }[] = [];

	for (const symbol of artifact.index.symbols) {
		if (!symbol.path.startsWith(prefix) || symbol.path.slice(prefix.length).includes('::') || !MEMBER_SYMBOL_KINDS.has(symbol.kind)) {
			continue;
		}

		members.push({
			rank: MEMBER_ORDER.indexOf(symbol.kind),
			member: {
				name: symbol.name,
				kind: symbol.kind,
				signature: symbol.signature,
				doc: symbol.doc,
				deprecated: symbol.deprecation !== null,
				sourceHref: symbolSourceLink(artifact, symbol)
			}
		});
	}

	return members.sort((a, b) => a.rank - b.rank || a.member.name.localeCompare(b.member.name)).map((entry) => entry.member);
}
