/**
 * Reads a prepared artifact out of the local cache.
 *
 * Both the Vite plugin and the CLI go through here, so there is one definition of "an artifact is
 * present and usable" and one error message for when it is not.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ExternalSymbol, Symbol } from '../rustdoc/symbols.ts';
import {
	type ArtifactManifest,
	type CrateRecord,
	parseCrateIndexFile,
	parseExternalIndexFile,
	parseManifest,
	parseSymbolIndexFile,
	parseSymbolShard,
	sourceLink
} from './schema.ts';

/** An artifact that is missing, unreadable, or does not match what was asked for. */
export class ArtifactError extends Error {
	constructor(message: string) {
		super(message);

		this.name = 'ArtifactError';
	}
}

/** The symbol index with its shards joined back together. */
export interface LoadedIndex {
	readonly symbols: readonly Symbol[];
	readonly paths: Readonly<Record<string, string>>;
	readonly names: Readonly<Record<string, readonly string[]>>;
	/**
	 * The reduced tier for symbols the framework does not define.
	 *
	 * Empty when the artifact predates the tier, which is why it is read defensively rather than
	 * required: an older artifact stays readable and simply annotates nothing external.
	 */
	readonly externals: {
		readonly symbols: readonly ExternalSymbol[];
		readonly names: Readonly<Record<string, readonly string[]>>;
		/** Crates the workspace depends on directly, for judging ambiguity. */
		readonly direct: readonly string[];
		/** Framework paths that re-export another crate's item. */
		readonly aliases: Readonly<Record<string, string>>;
	};
}

export interface LoadedArtifact {
	readonly manifest: ArtifactManifest;
	readonly index: LoadedIndex;
	readonly crates: readonly CrateRecord[];
	/** Absolute path of the unpacked artifact directory. */
	readonly root: string;
}

/** Absolute directory an artifact for a given framework version is cached in. */
export function artifactDir(projectRoot: string, cacheDir: string, frameworkVersion: string): string {
	return path.resolve(projectRoot, cacheDir, frameworkVersion);
}

/**
 * Loads and validates the artifact for one framework version.
 *
 * The version is checked against the manifest rather than trusted from the directory name: a cache
 * directory is just a name, and documenting 0.20.0 with 0.19.0's symbols would be invisible.
 */
export async function loadArtifact(root: string, expectedVersion: string): Promise<LoadedArtifact> {
	const manifest = parseManifest(await readJson(path.join(root, 'manifest.json'), expectedVersion));

	if (manifest.framework.version !== expectedVersion) {
		throw new ArtifactError(
			`Artifact version mismatch.\n\n  Requested: ${expectedVersion}\n  Artifact:  ${manifest.framework.version}\n  Location:  ${root}\n\nRegenerate the artifact, or correct the version in src/lib/docs/config.ts.`
		);
	}

	const symbolsDir = path.join(root, manifest.contents.symbols);
	const indexFile = parseSymbolIndexFile(await readJson(path.join(symbolsDir, 'index.json'), expectedVersion));

	// Every shard is read: the build annotates code from any crate, so there is nothing to defer.
	// Sharding is for consumers that only need part of it — see the artifact documentation.
	const symbols: Symbol[] = [];

	for (const shard of indexFile.shards) {
		const records = parseSymbolShard(await readJson(path.join(symbolsDir, shard.file), expectedVersion), shard.file);

		symbols.push(...records);
	}

	const crates = manifest.contents.crates
		? parseCrateIndexFile(await readJson(path.join(root, manifest.contents.crates), expectedVersion)).crates
		: [];

	const externals = manifest.contents.externals
		? parseExternalIndexFile(await readJson(path.join(root, manifest.contents.externals), expectedVersion))
		: { symbols: [], names: {}, direct: [], aliases: {} };

	return {
		manifest,
		index: {
			symbols,
			paths: indexFile.paths,
			names: indexFile.names,
			externals: {
				symbols: externals.symbols,
				names: externals.names,
				direct: externals.direct ?? [],
				aliases: externals.aliases ?? {}
			}
		},
		crates,
		root
	};
}

async function readJson(file: string, version: string): Promise<unknown> {
	const contents = await readFile(file, 'utf8').catch(() => {
		throw new ArtifactError(
			`No documentation artifact for framework version ${version}.\n\n  Expected: ${file}\n\nPrepare one from a local framework checkout:\n\n  bun run docs:prepare --local ../framework\n`
		);
	});

	try {
		return JSON.parse(contents);
	} catch (cause) {
		throw new ArtifactError(`Artifact file ${file} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
	}
}

/**
 * Resolves a symbol by any path it is reachable at.
 *
 * Authors write facade paths (`framework::Singleton`); the index is keyed by defining path
 * (`framework_core::scope::Singleton`). Both resolve here, so a page never has to know which is which.
 */
export function findSymbol(artifact: LoadedArtifact, requested: string): Symbol | undefined {
	const canonical = artifact.index.paths[requested];

	if (!canonical) {
		return undefined;
	}

	return artifact.index.symbols.find((symbol) => symbol.path === canonical);
}

/**
 * Suggests near-miss paths for a symbol that was not found.
 *
 * Used by the build-time reference check and by the 404 page, so a wrong path is a signpost rather
 * than a dead end.
 */
export function suggestSymbols(artifact: LoadedArtifact, requested: string, limit = 5): string[] {
	const wanted = requested.split('::').pop()?.toLowerCase() ?? requested.toLowerCase();
	const scored: { path: string; score: number }[] = [];

	for (const path of Object.keys(artifact.index.paths)) {
		const name = path.split('::').pop()?.toLowerCase() ?? '';

		if (name === wanted) {
			scored.push({ path, score: 0 });

			continue;
		}

		if (name.includes(wanted) || wanted.includes(name)) {
			scored.push({ path, score: Math.abs(name.length - wanted.length) + 1 });
		}
	}

	return scored
		.sort((a, b) => a.score - b.score || a.path.length - b.path.length)
		.slice(0, limit)
		.map((entry) => entry.path);
}

/** Repository URL for a symbol's definition, or null when it has no recorded source location. */
export function symbolSourceLink(artifact: LoadedArtifact, symbol: Symbol): string | null {
	if (!symbol.source) {
		return null;
	}

	return sourceLink(artifact.manifest, symbol.source.file, symbol.source.line);
}
