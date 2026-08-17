/**
 * Site-level documentation configuration.
 *
 * This is the single place that knows which framework releases the site documents, where the
 * framework lives, and how a source path turns into a link. Components must never hardcode a
 * GitHub URL or a version string — they read it from here, or from the artifact manifest surfaced
 * through the snippet registry.
 */

import { parseVersion, type SemVer, type VersionId, versionId } from './version/semver.ts';

/** A public documentation release, as exposed in the URL space and version switcher. */
export interface DocsVersion {
	/** Stable URL segment, e.g. `1.0.0`. Aliases are configured separately. */
	readonly id: VersionId;
	/** Public content SemVer. Drives overlays, ranges, routes, and displayed release identity. */
	readonly releaseVersion: SemVer;
	/** Human label for the version switcher. */
	readonly label: string;
}

/** Coordinates of the Rust framework this site documents. */
export interface FrameworkCoordinates {
	/** Facade crate name; also the artifact and release-tag prefix. */
	readonly crate: string;
	/** Display name used in prose and page titles. */
	readonly name: string;
	/** Canonical repository URL, without a trailing slash. */
	readonly repository: string;
	/**
	 * Release tag for a given version. The framework releases through release-plz, which tags
	 * every crate separately as `<crate>-v<version>` — there is no repository-wide `v<version>` tag.
	 */
	readonly releaseTag: (version: string) => string;
}

/** A sidebar filter and the framework crates whose API pages belong to it. */
export interface DocsTopic {
	/** Stable identifier, as written in page frontmatter. */
	readonly id: string;
	readonly label: string;
	/** One line explaining what belongs here. */
	readonly description: string;
	/** Framework crates classified under this topic. */
	readonly crates: readonly string[];
}

/** Optional Rustdoc-derived enrichments for types outside the framework workspace. */
export interface RustdocEnrichmentConfig {
	/**
	 * External crates considered plausible imports when resolving ambiguous names in examples.
	 *
	 * `workspace` derives the list from `[workspace.dependencies]`; use a list when the documented
	 * surface deliberately exposes only a subset or when dependencies live outside that table.
	 */
	readonly directDependencyCrates: 'workspace' | readonly string[];
	/**
	 * Crates supplied by `rust-docs-json` whose full API data should enrich hover cards.
	 *
	 * Keep this deliberately small: each crate is parsed during `docs:prepare`. The Rust standard
	 * library defaults cover the types most commonly present in framework examples.
	 */
	readonly standardLibraryCrates: readonly string[];
}

/** Everything the documentation build and the rendered site need to know about the framework. */
export interface DocsConfig {
	readonly framework: FrameworkCoordinates;
	/** Documented releases, newest first. */
	readonly versions: readonly DocsVersion[];
	/** Which entry of `versions` `latest` resolves to. Always an explicit id, never a magic value. */
	readonly latest: VersionId;
	/** Where prepared artifacts are unpacked, relative to the project root. */
	readonly cacheDir: string;
	/** Public releases whose cached artifacts are preserved historical records. */
	readonly readOnlyArtifactVersions: readonly VersionId[];
	/** Releases whose artifacts are eligible to provide current framework symbol facts and links. */
	readonly symbolEnrichmentVersions: readonly VersionId[];
	/** Slug of the page `/docs/<version>` redirects to. */
	readonly landingSlug: string;
	/** Declared sidebar filters and their crate classifications. */
	readonly topics: readonly DocsTopic[];
	/** Optional Rustdoc enrichment policy. */
	readonly rustdoc: RustdocEnrichmentConfig;
}

export const docsConfig: DocsConfig = {
	framework: {
		crate: 'upwell',
		name: 'Upwell',
		repository: 'https://github.com/upwell-rs/upwell',
		releaseTag: (version) => `v${version}`
	},

	// Newest first. Only explicit public releases belong in the picker.
	versions: [
		{
			id: versionId('1.0.0'),
			releaseVersion: parseVersion('1.0.0', 'docsConfig release 1.0.0'),
			label: '1.0.0'
		},
		{
			id: versionId('0.20.0'),
			releaseVersion: parseVersion('0.20.0', 'docsConfig release 0.20.0'),
			label: '0.20.0'
		}
	],

	latest: versionId('1.0.0'),
	cacheDir: '.cache/upwell-docs',
	readOnlyArtifactVersions: [versionId('0.20.0')],
	// The preserved 0.20 cache records the predecessor's `overseerd` API, not Upwell's public API.
	// Keep its authored Upwell guides routable, but never use that provenance to annotate symbols.
	symbolEnrichmentVersions: [versionId('1.0.0')],
	landingSlug: 'getting-started',
	topics: [
		{
			id: 'framework',
			label: 'Framework',
			description: 'Application setup, components, dependency injection, and core framework APIs.',
			crates: ['upwell', 'upwell-app', 'upwell-macros', 'upwell-core']
		},
		{
			id: 'web',
			label: 'Web',
			description: 'HTTP and WebSocket controllers, routes, messages, and topic APIs.',
			crates: ['upwell-axum', 'upwell-axum-macros']
		},
		{
			id: 'rpc',
			label: 'RPC',
			description: 'RPC services, handlers, and generated clients.',
			crates: ['upwell-rpc-macros']
		},
		{
			id: 'jobs',
			label: 'Jobs',
			description: 'Scheduled jobs and their execution policies.',
			crates: ['upwell-jobs-macros']
		},
		{
			id: 'tooling',
			label: 'Cargo Upwell',
			description: 'Project inspection, automation, extensions, and command-line tooling.',
			crates: []
		}
	],
	// These are the first-tier external crates worth enriching when rust-docs-json is installed.
	rustdoc: {
		directDependencyCrates: 'workspace',
		standardLibraryCrates: ['std', 'core', 'alloc']
	}
};

/**
 * Resolves a URL version segment to a documented release.
 *
 * `latest` resolves through `config.latest`, so an entry may be reached either by its own id or by
 * the alias. The alias is never a picker entry and always resolves to an explicit release id.
 */
export function resolveVersion(config: DocsConfig, id: string): DocsVersion | undefined {
	const wanted = id === 'latest' ? config.latest : id;

	return config.versions.find((version) => version.id === wanted);
}

/** The public release SemVer an entry documents, which is what content is filtered against. */
export function documentedVersion(version: DocsVersion): SemVer {
	return version.releaseVersion;
}

/** Whether a release's existing cache artifact is an immutable historical record. */
export function isArtifactReadOnly(config: DocsConfig, releaseVersion: string): boolean {
	return config.readOnlyArtifactVersions.some((version) => version === releaseVersion);
}

/** Whether an artifact may enrich this release with Upwell symbol facts and symbol links. */
export function isSymbolEnrichmentEligible(config: DocsConfig, version: DocsVersion): boolean {
	return config.symbolEnrichmentVersions.some((eligible) => eligible === version.id);
}

/** The release the site treats as current. Throws at import time if the config is inconsistent. */
export function latestVersion(config: DocsConfig): DocsVersion {
	const version = resolveVersion(config, config.latest);

	if (!version) {
		throw new Error(`docsConfig.latest is "${config.latest}", which is not present in docsConfig.versions.`);
	}

	return version;
}
