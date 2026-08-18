import process from 'node:process';

import { frameworkCrate, frameworkCrates, resolveSymbolPagesConfig, type DocsConfig, type DocsVersion, type FrameworkCrateCoordinates } from '@upwell/docs-core/config';
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

import { renderRustdocMarkdown } from './markdown.ts';

export interface ArtifactServiceOptions {
	readonly config: DocsConfig;
	readonly symbolPagesFor: (releaseVersion: DocsVersion['releaseVersion']) => readonly SymbolPageSummary[];
	readonly symbolHref: (source: string, versionId: string, segments: string) => string;
	readonly sourceHref?: (source: string, versionId: string, file: string, line: number) => string;
	readonly building: boolean;
	readonly projectRoot?: string;
}

export type SymbolDestination =
	| { readonly kind: 'authored'; readonly href: string; readonly page: SymbolPageSummary }
	| { readonly kind: 'generated'; readonly href: string; readonly segments: string }
	| { readonly kind: 'source'; readonly href: string | null };

export interface SymbolCatalogRecord {
	readonly source: string;
	readonly canonical: string;
	readonly path: string;
	readonly name: string;
	readonly crate: string;
	readonly kind: string;
	readonly summary: string | null;
	readonly signature: string | null;
	readonly destination: SymbolDestination;
}

export interface SymbolCatalog {
	readonly artifact: LoadedArtifact;
	readonly generated: boolean;
	readonly records: readonly SymbolCatalogRecord[];
	resolve(path: string): SymbolCatalogRecord | undefined;
	destination(path: string): SymbolDestination | undefined;
}

export interface ArtifactService {
	getArtifact(source: FrameworkCrateCoordinates, version: DocsVersion): Promise<LoadedArtifact | null>;
	getCatalog(source: FrameworkCrateCoordinates, version: DocsVersion): Promise<SymbolCatalog | null>;
	getSymbolInfo(source: FrameworkCrateCoordinates, version: DocsVersion, symbolPath: string): Promise<SymbolInfo | undefined>;
	getSymbolDocs(source: FrameworkCrateCoordinates, version: DocsVersion, symbolPath: string): Promise<string>;
}

/** Server-only artifact access and the canonical destination catalog shared by all consumers. */
export function createArtifactService(options: ArtifactServiceOptions): ArtifactService {
	const { config, symbolPagesFor, symbolHref, sourceHref, building, projectRoot = process.cwd() } = options;
	const artifacts = new Map<string, Promise<LoadedArtifact | null>>();
	const catalogs = new Map<string, Promise<SymbolCatalog | null>>();

	function getArtifact(source: FrameworkCrateCoordinates, version: DocsVersion): Promise<LoadedArtifact | null> {
		const key = `${source.crate}/${version.releaseVersion.raw}`;
		const existing = artifacts.get(key);

		if (existing) {
			return existing;
		}

		const loading = loadArtifact(artifactDir(projectRoot, config.cacheDir, source.crate, version.releaseVersion.raw), version.releaseVersion.raw)
			.catch(async (cause) => {
				const fallback = source === config.framework.root
					? await loadArtifact(legacyArtifactDir(projectRoot, config.cacheDir, version.releaseVersion.raw), version.releaseVersion.raw).catch(() => null)
					: await findVendoredArtifact(source, version);

				if (!fallback) {
					throw cause;
				}

				return fallback;
			});

		artifacts.set(key, loading);

		return loading;
	}

	async function findVendoredArtifact(source: FrameworkCrateCoordinates, version: DocsVersion): Promise<LoadedArtifact | null> {
		for (const owner of frameworkCrates(config)) {
			for (const ownerVersion of owner.versions) {
				const candidate = await loadArtifact(
					artifactDir(projectRoot, config.cacheDir, owner.crate, ownerVersion.releaseVersion.raw),
					ownerVersion.releaseVersion.raw
				).catch(() => null);
				const snapshot = candidate?.manifest.sources?.find((entry) => entry.crate === source.crate && entry.version === version.releaseVersion.raw);

				if (candidate && snapshot && candidate.manifest.documentation.releaseVersion === version.releaseVersion.raw) {
					return candidate;
				}
			}
		}

		return null;
	}

	function getCatalog(source: FrameworkCrateCoordinates, version: DocsVersion): Promise<SymbolCatalog | null> {
		const key = `${source.crate}/${version.id}`;
		const existing = catalogs.get(key);

		if (existing) {
			return existing;
		}

		const loading = getArtifact(source, version).then((artifact) =>
			artifact ? buildCatalog(
				artifact,
				source,
				version,
				source === config.framework.root ? symbolPagesFor(version.releaseVersion) : [],
				config,
				building,
				symbolHref
			) : null
		);

		catalogs.set(key, loading);

		return loading;
	}

	async function getSymbolInfo(source: FrameworkCrateCoordinates, version: DocsVersion, symbolPath: string): Promise<SymbolInfo | undefined> {
		const catalog = await getCatalog(source, version);
		const symbol = catalog ? findSymbol(catalog.artifact, symbolPath) : undefined;

		if (!catalog || !symbol) {
			return undefined;
		}

			return {
			path: symbolPath,
			canonicalPath: symbol.path,
			name: symbol.name,
			kind: symbol.kind,
			procMacro: symbol.procMacro,
			crate: symbol.crate,
			signature: symbol.signature,
			doc: symbol.doc,
			feature: symbol.feature,
			deprecation: symbol.deprecation,
				sourceHref: symbol.source && sourceHref ? sourceHref(catalog.resolve(symbolPath)?.source ?? source.crate, version.id, symbol.source.file, symbol.source.line) : symbolSourceLink(catalog.artifact, symbol),
			source: symbol.source,
			implementations: symbol.implementations,
			implementors: symbol.implementors.map((canonical) => toLink(catalog, canonical)),
			members: collectMembers(catalog.artifact, symbol)
		};
	}

	async function getSymbolDocs(source: FrameworkCrateCoordinates, version: DocsVersion, symbolPath: string): Promise<string> {
		const artifact = await getArtifact(source, version);

		return renderRustdocMarkdown(artifact ? (findSymbol(artifact, symbolPath)?.docs ?? null) : null);
	}

	return { getArtifact, getCatalog, getSymbolInfo, getSymbolDocs };
}

function legacyArtifactDir(projectRoot: string, cacheDir: string, version: string): string {
	return `${projectRoot}/${cacheDir}/${version}`.replaceAll('//', '/');
}

export function buildCatalog(
	artifact: LoadedArtifact,
	source: FrameworkCrateCoordinates,
	version: DocsVersion,
	pages: readonly SymbolPageSummary[],
	config: DocsConfig,
	building: boolean,
	symbolHref: (source: string, versionId: string, segments: string) => string
): SymbolCatalog {
	const policy = resolveSymbolPagesConfig(config.rustdoc, artifact.manifest.framework.crates, building);

	if (policy.enabled && !artifact.manifest.capabilities.includes('docs')) {
		throw new Error(
			`The documentation artifact for ${version.releaseVersion.raw} predates generated symbol documentation.\n\n` +
				`Regenerate it with:\n\n  bun run docs:prepare --local <framework-checkout> --version ${version.id}\n`
		);
	}

	const symbols = new Map(artifact.index.symbols.map((symbol) => [symbol.path, symbol]));
	const sourceByCargoCrate = new Map(
		(artifact.manifest.sources ?? []).flatMap((entry) => entry.crates.map((crate) => [crate, entry] as const))
	);
	const aliases = aliasesByCanonical(artifact);
	const authored = authoredOverrides(artifact, pages);
	const records: SymbolCatalogRecord[] = [];
	const byCanonical = new Map<string, SymbolCatalogRecord>();
	for (const symbol of artifact.index.symbols) {
		const declarationSegments = symbol.path.replaceAll('::', '/');
		const owner = sourceByCargoCrate.get(symbol.crate);
		const ownerConfig = owner ? frameworkCrate(config, owner.crate) : undefined;
		const ownerVersion = ownerConfig?.versions.find((candidate) => candidate.releaseVersion.raw === owner?.version);
		const destinationVersion = owner?.primary ? version.id : ownerVersion?.id ?? owner?.version ?? version.id;
		const page = authored.get(symbol.path);
		const inScope = ownerConfig !== undefined || policy.crates === null || policy.crates.has(symbol.crate);
		const destination: SymbolDestination = page
			? { kind: 'authored', href: symbolHref(source.crate, version.id, page.segments), page }
			: policy.enabled && inScope
					? {
						kind: 'generated',
						href: symbolHref(owner?.crate ?? source.crate, destinationVersion, declarationSegments),
						segments: declarationSegments
					}
				: { kind: 'source', href: symbolSourceLink(artifact, symbol) };
		const record: SymbolCatalogRecord = {
			source: owner?.crate ?? source.crate,
			canonical: symbol.path,
			path: preferredPath(aliases.get(symbol.path) ?? [symbol.path], symbol.path),
			name: symbol.name,
			crate: symbol.crate,
			kind: symbol.kind,
			summary: symbol.doc,
			signature: symbol.signature,
			destination
		};

		records.push(record);
		byCanonical.set(symbol.path, record);
	}

	records.sort((a, b) => a.crate.localeCompare(b.crate) || a.path.localeCompare(b.path));

	return {
		artifact,
		generated: policy.enabled,
		records,
		resolve(path) {
			const canonical = artifact.index.paths[path] ?? path;

			return byCanonical.get(canonical);
		},
		destination(path) {
			const canonical = artifact.index.paths[path] ?? path;
			const record = byCanonical.get(canonical);

			if (record) {
				return record.destination;
			}

			const symbol = symbols.get(canonical);

			return symbol ? { kind: 'source', href: symbolSourceLink(artifact, symbol) } : undefined;
		}
	};
}

function authoredOverrides(artifact: LoadedArtifact, pages: readonly SymbolPageSummary[]): Map<string, SymbolPageSummary> {
	const candidates = new Map<string, SymbolPageSummary[]>();

	for (const page of pages.filter((entry) => !entry.draft)) {
		const canonical = artifact.index.paths[page.symbol];

		if (!canonical) {
			continue;
		}

		const list = candidates.get(canonical) ?? [];
		list.push(page);
		candidates.set(canonical, list);
	}

	const resolved = new Map<string, SymbolPageSummary>();

	for (const [canonical, matches] of candidates) {
		const declaration = matches.find((page) => page.symbol === canonical);

		if (declaration) {
			resolved.set(canonical, declaration);
			continue;
		}

		if (matches.length > 1) {
			throw new Error(
				`Two symbol pages document the same symbol.\n\n  Pages:\n${matches.map((page) => `    ${page.segments}`).join('\n')}\n\n  Both resolve to:\n    ${canonical}\n\n  These are different re-export paths for one symbol. Keep one page and delete the other.`
			);
		}

		resolved.set(canonical, matches[0]);
	}

	return resolved;
}

function aliasesByCanonical(artifact: LoadedArtifact): Map<string, string[]> {
	const aliases = new Map<string, string[]>();

	for (const [path, canonical] of Object.entries(artifact.index.paths)) {
		const paths = aliases.get(canonical) ?? [];
		paths.push(path);
		aliases.set(canonical, paths);
	}

	return aliases;
}

function preferredPath(paths: readonly string[], canonical: string): string {
	return paths.reduce((best, reachable) => {
		const bySegments = reachable.split('::').length - best.split('::').length;

		return bySegments < 0 || (bySegments === 0 && reachable.length < best.length) ? reachable : best;
	}, canonical);
}

function toLink(catalog: SymbolCatalog, canonical: string): SymbolLink {
	const record = catalog.resolve(canonical);
	const path = record?.path ?? canonical;
	const destination = catalog.destination(canonical);

	return { path, name: path.split('::').pop() ?? path, href: destination?.href ?? null };
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
