/** Shared configuration contracts and resolution helpers for a documentation site. */

import type { SemVer, VersionId } from "./semver.ts";

export interface DocsVersion {
  readonly id: VersionId;
  readonly releaseVersion: SemVer;
  readonly label: string;
}

export interface FrameworkCrateCoordinates {
  /** Root Cargo package used to identify this repository/workspace. */
  readonly crate: string;
  readonly repository: string;
  /** Independent public releases for this repository. */
  readonly versions: readonly DocsVersion[];
  readonly latest: VersionId;
  readonly releaseTag: (version: string) => string;
}

export interface FrameworkCoordinates {
  readonly name: string;
  /** Primary facade repository. Every Cargo workspace member is discovered automatically. */
  readonly root: FrameworkCrateCoordinates;
  /** Additional repositories. One entry per Git repository, not per Cargo workspace member. */
  readonly crates: readonly FrameworkCrateCoordinates[];
}

/** Repository identity safe to return from SvelteKit load functions. */
export interface DocsSource {
  readonly crate: string;
  readonly repository: string;
}

export function docsSource(crate: FrameworkCrateCoordinates): DocsSource {
  return { crate: crate.crate, repository: crate.repository };
}

export function frameworkCrates(config: DocsConfig): readonly FrameworkCrateCoordinates[] {
  return [config.framework.root, ...config.framework.crates];
}

export function frameworkCrate(
  config: DocsConfig,
  source: string,
): FrameworkCrateCoordinates | undefined {
  return frameworkCrates(config).find((crate) => crate.crate === source);
}

export function frameworkCrateVersion(
  crate: FrameworkCrateCoordinates,
  id: string,
): DocsVersion | undefined {
  const wanted = id === "latest" ? crate.latest : id;

  return crate.versions.find((version) => version.id === wanted);
}

export function docsVersions(config: DocsConfig): readonly DocsVersion[] {
  return config.framework.root.versions;
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

export type DocsPrerenderValue = boolean | "auto";

export type DocsPrerenderRoute =
  | "docs"
  | "symbols"
  | "api"
  | "search"
  | "redirects";

export type DocsPrerenderSetting =
  | DocsPrerenderValue
  | {
      readonly development?: DocsPrerenderValue;
      readonly production?: DocsPrerenderValue;
    };

export interface DocsPrerenderPolicy {
  readonly default?: DocsPrerenderSetting;
  readonly routes?: Partial<
    Readonly<Record<DocsPrerenderRoute, DocsPrerenderSetting>>
  >;
}

export type DocsPrerenderConfig =
  | DocsPrerenderSetting
  | DocsPrerenderPolicy;

export interface DocsConfig {
  readonly framework: FrameworkCoordinates;
  readonly cacheDir: string;
  readonly readOnlyArtifactVersions?: readonly VersionId[];
  readonly landingSlug: string;
  readonly topics: readonly DocsTopic[];
  readonly rustdoc: RustdocEnrichmentConfig;
  /** Route prerendering policy. Omitted values default to prerendering. */
  readonly prerender?: DocsPrerenderConfig;
}

/** Resolves a route's build-time prerender option, defaulting to static output. */
export function resolvePrerender(
  config: DocsConfig,
  route: DocsPrerenderRoute,
  development: boolean,
): DocsPrerenderValue {
  const policy = config.prerender;

  if (policy === undefined || typeof policy !== "object") {
    return policy ?? true;
  }

  if ("default" in policy || "routes" in policy) {
    return (
      resolvePrerenderSetting(policy.routes?.[route], development) ??
      resolvePrerenderSetting(policy.default, development) ??
      true
    );
  }

  return (
    resolvePrerenderSetting(policy as DocsPrerenderSetting, development) ?? true
  );
}

function resolvePrerenderSetting(
  setting: DocsPrerenderSetting | undefined,
  development: boolean,
): DocsPrerenderValue | undefined {
  if (setting === undefined || typeof setting !== "object") {
    return setting;
  }

  return development ? setting.development : setting.production;
}

export function resolveVersion(
  config: DocsConfig,
  id: string,
): DocsVersion | undefined {
  return frameworkCrateVersion(config.framework.root, id);
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
  const version = frameworkCrateVersion(config.framework.root, config.framework.root.latest);

  if (!version) {
    throw new Error(
      `framework.root.latest is "${config.framework.root.latest}", which is not present in framework.root.versions.`,
    );
  }

  return version;
}
