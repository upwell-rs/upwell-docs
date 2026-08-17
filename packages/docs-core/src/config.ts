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
  /** Generated API pages. Omitted and `false` keep the authored-only default. */
  readonly symbolPages?: SymbolPagesConfig;
}

export type SymbolPagesConfig =
  | boolean
  | "production"
  | {
      readonly when?: "always" | "production";
      readonly crates?: "configured" | "all" | readonly string[];
    };

export interface ResolvedSymbolPagesConfig {
  readonly enabled: boolean;
  readonly when: "always" | "production";
  /** `null` means every crate; otherwise exact Cargo crate names. */
  readonly crates: ReadonlySet<string> | null;
}

export interface DocsConfig {
  readonly framework: FrameworkCoordinates;
  readonly versions: readonly DocsVersion[];
  readonly latest: VersionId;
  readonly cacheDir: string;
  readonly readOnlyArtifactVersions?: readonly VersionId[];
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
  return config.readOnlyArtifactVersions?.some(
    (version) => version === releaseVersion,
  ) ?? false;
}

export function isSymbolEnrichmentEligible(
  config: DocsConfig,
  version: DocsVersion,
): boolean {
  return config.symbolEnrichmentVersions.some(
    (eligible) => eligible === version.id,
  );
}

/** Resolves generated symbol-page activation and crate scope without reading an artifact. */
export function resolveSymbolPagesConfig(
  rustdoc: RustdocEnrichmentConfig,
  workspaceCrates: readonly string[],
  building: boolean,
): ResolvedSymbolPagesConfig {
  const value = rustdoc.symbolPages;
  const when =
    value === true
      ? "always"
      : value === "production"
        ? "production"
        : typeof value === "object"
          ? (value.when ?? "production")
          : "production";
  const configured =
    typeof value === "object" ? (value.crates ?? "configured") : "configured";
  const enabled = value !== undefined && value !== false && (when === "always" || building);
  const selected =
    configured === "all"
      ? null
      : configured === "configured"
        ? rustdoc.directDependencyCrates === "workspace"
          ? workspaceCrates
          : rustdoc.directDependencyCrates
        : configured;

  return { enabled, when, crates: selected === null ? null : new Set(selected) };
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
