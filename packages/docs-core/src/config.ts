/** Shared configuration contracts and resolution helpers for a documentation site. */

import type { SemVer, VersionId } from "./semver.ts";

export interface DocsVersion {
  readonly id: VersionId;
  readonly releaseVersion: SemVer;
  readonly label: string;
}

export interface FrameworkCoordinates {
  readonly crate: string;
  readonly name: string;
  readonly repository: string;
  readonly releaseTag: (version: string) => string;
}

export interface DocsTopic {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly crates: readonly string[];
}

export interface RustdocEnrichmentConfig {
  readonly directDependencyCrates: "workspace" | readonly string[];
  readonly standardLibraryCrates: readonly string[];
}

export interface DocsConfig {
  readonly framework: FrameworkCoordinates;
  readonly versions: readonly DocsVersion[];
  readonly latest: VersionId;
  readonly cacheDir: string;
  readonly readOnlyArtifactVersions: readonly VersionId[];
  readonly symbolEnrichmentVersions: readonly VersionId[];
  readonly landingSlug: string;
  readonly topics: readonly DocsTopic[];
  readonly rustdoc: RustdocEnrichmentConfig;
}

export function resolveVersion(
  config: DocsConfig,
  id: string,
): DocsVersion | undefined {
  const wanted = id === "latest" ? config.latest : id;

  return config.versions.find((version) => version.id === wanted);
}

export function documentedVersion(version: DocsVersion): SemVer {
  return version.releaseVersion;
}

export function isArtifactReadOnly(
  config: DocsConfig,
  releaseVersion: string,
): boolean {
  return config.readOnlyArtifactVersions.some(
    (version) => version === releaseVersion,
  );
}

export function isSymbolEnrichmentEligible(
  config: DocsConfig,
  version: DocsVersion,
): boolean {
  return config.symbolEnrichmentVersions.some(
    (eligible) => eligible === version.id,
  );
}

export function latestVersion(config: DocsConfig): DocsVersion {
  const version = resolveVersion(config, config.latest);

  if (!version) {
    throw new Error(
      `docsConfig.latest is "${config.latest}", which is not present in docsConfig.versions.`,
    );
  }

  return version;
}
