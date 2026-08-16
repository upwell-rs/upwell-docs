/**
 * Site-level documentation configuration.
 *
 * This is the single place that knows which framework releases the site documents, where the
 * framework lives, and how a source path turns into a link. Components must never hardcode a
 * GitHub URL or a version string — they read it from here, or from the artifact manifest surfaced
 * through the snippet registry.
 */

import { parseVersion, type SemVer, type VersionId, versionId } from './version/semver.ts';

/** A documented framework release, as exposed in the URL space and the version switcher. */
export interface DocsVersion {
	/**
	 * URL segment, e.g. `latest` or `0.20`.
	 *
	 * A label, never a computed value. `latest` is deliberately a **moving** id: it documents
	 * whatever version the framework checkout currently declares, and that version changes under it
	 * whenever a release is cut. A pinned archive id is a separate entry.
	 */
	readonly id: VersionId;
	/**
	 * Framework version this entry documents, from the checkout's Cargo.toml.
	 *
	 * The value here is a default for tooling that has no artifact yet; the artifact's manifest is
	 * authoritative once one exists. It only changes when a release is actually cut, which is why
	 * documentation written ahead of a release names the *next* version rather than this one.
	 */
	readonly frameworkVersion: SemVer;
	/** Human label for the version switcher. */
	readonly label: string;
	/**
	 * True when the id moves as releases are cut, rather than pinning one.
	 *
	 * A moving id cannot be linked to durably, so the page shows the exact version it is currently
	 * documenting alongside the label — otherwise "latest" would be the only thing a reader could
	 * tell anyone, and it means something different every month.
	 */
	readonly moving?: boolean;
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
	/** Slug of the page `/docs/<version>` redirects to. */
	readonly landingSlug: string;
	/** Declared sidebar filters and their crate classifications. */
	readonly topics: readonly DocsTopic[];
	/** Optional Rustdoc enrichment policy. */
	readonly rustdoc: RustdocEnrichmentConfig;
}

export const docsConfig: DocsConfig = {
	framework: {
		crate: 'framework',
		name: 'Framework',
		repository: 'https://github.com/your-org/your-framework',
		releaseTag: (version) => `v${version}`
	},

	// Newest first. Pinned archive entries are added below `latest` as releases are frozen.
	versions: [
		{
			id: versionId('latest'),
			frameworkVersion: parseVersion('0.1.0', 'docsConfig latest'),
			label: 'Latest',
			moving: true
		}
	],

	latest: versionId('latest'),
	cacheDir: '.cache/framework-docs',
	landingSlug: 'getting-started',
	// Add topics and assign your framework crates here. An empty list hides topic filtering.
	topics: [],
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
 * the alias. Nothing downstream ever treats the string `latest` as a version: what it carries is a
 * `DocsVersion`, whose `frameworkVersion` is the fact.
 */
export function resolveVersion(config: DocsConfig, id: string): DocsVersion | undefined {
	const wanted = id === 'latest' ? config.latest : id;

	return config.versions.find((version) => version.id === wanted);
}

/** The framework version an entry documents, which is what content is filtered against. */
export function documentedVersion(version: DocsVersion): SemVer {
	return version.frameworkVersion;
}

/** The release the site treats as current. Throws at import time if the config is inconsistent. */
export function latestVersion(config: DocsConfig): DocsVersion {
	const version = resolveVersion(config, config.latest);

	if (!version) {
		throw new Error(`docsConfig.latest is "${config.latest}", which is not present in docsConfig.versions.`);
	}

	return version;
}
