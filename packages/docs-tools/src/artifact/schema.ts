/**
 * The framework documentation artifact schema.
 *
 * An artifact is everything the website needs to document one framework release without a checkout
 * of that release at build time. Its schema version is deliberately independent of the framework
 * version: the site must keep rendering a 0.20.0 artifact after the format has moved on.
 *
 * See `docs/architecture/framework-docs-artifact.md` for the format and its migration policy.
 */

import type { ExternalSymbol, Symbol } from "../rustdoc/symbols.ts";

/**
 * Current artifact schema version.
 *
 * Bump for any change a consumer must know about. Additive, optional fields do not require a bump;
 * removing a field, changing its meaning, or making an optional field required does.
 */
export const ARTIFACT_SCHEMA_VERSION = 3;

/**
 * Schema versions this build of the website can read.
 *
 * Version 2 split the single `symbols.json` into per-crate shards under `symbols/`, and added the
 * compact `search.json`. A version 1 artifact is rejected rather than half-read; regenerating one
 * is a single command, so supporting both would be carrying a migration nobody needs.
 */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [3];

/**
 * Optional tiers of artifact content.
 *
 * Tiers are declared rather than inferred, so the site can degrade per capability instead of
 * probing for files.
 */
export type ArtifactCapability = "symbols" | "crates" | "search" | "externals" | "docs";

export const REQUIRED_CAPABILITIES: readonly ArtifactCapability[] = ["symbols"];

/** How an artifact was produced, which is the only difference the site tolerates between them. */
export type ArtifactOrigin = "local" | "release";

export interface ArtifactManifest {
  readonly schemaVersion: number;
  readonly framework: {
    /** Display name, e.g. `Framework`. */
    readonly name: string;
    /** Facade crate, e.g. `framework`. */
    readonly crate: string;
    /** Cargo package version of the source facade crate. */
    readonly version: string;
    /** Every workspace crate the index covers. */
    readonly crates: readonly string[];
  };
  /** Public documentation release and the separate source identity it was generated from. */
  readonly documentation: {
    readonly releaseVersion: string;
    readonly sourcePackageVersion: string;
  };
  readonly git: {
    readonly sha: string;
    /** Release tag, when generated from one. Null for a working-tree build. */
    readonly tag: string | null;
    readonly repository: string;
    /** True when the checkout had uncommitted changes. Release artifacts must be clean. */
    readonly dirty: boolean;
  };
  /** ISO 8601, UTC. */
  readonly generatedAt: string;
  readonly generator: {
    readonly name: string;
    readonly version: string;
    readonly origin: ArtifactOrigin;
    /** rustdoc JSON format version the index was built from. */
    readonly rustdocFormatVersion: number;
  };
  readonly rust: {
    /** `rustc --version` of the nightly used for rustdoc, when available. */
    readonly toolchain: string | null;
    readonly edition: string;
  };
  readonly capabilities: readonly ArtifactCapability[];
  /**
   * Template for linking a source location back to the repository.
   *
   * Placeholders: `{path}` and `{line}`. Keeping this in the manifest is what stops GitHub URLs
   * from being hardcoded across components, and pins every link to the documented commit.
   */
  readonly sourceLinkTemplate: string;
  /** Artifact-relative locations of each tier. */
  readonly contents: {
    /** Directory holding `index.json` and the per-crate shards. */
    readonly symbols: string;
    readonly crates?: string;
    /** Compact name/path/kind list, small enough to ship to a browser. */
    readonly search?: string;
    /**
     * Reduced records for symbols the framework refers to but does not define.
     *
     * Additive and optional, so an artifact without it is still valid — the site simply annotates
     * nothing external, which is what it did before this tier existed.
     */
    readonly externals?: string;
  };
}

/** One workspace crate and its Cargo features. */
export interface CrateRecord {
  readonly name: string;
  readonly version: string;
  readonly description: string | null;
  readonly published: boolean;
  readonly features: Readonly<Record<string, readonly string[]>>;
  readonly path: string;
}

/** One shard of the symbol index: every symbol defined by a single crate. */
export interface SymbolShard {
  readonly crate: string;
  /** File name within the symbols directory. */
  readonly file: string;
  readonly count: number;
}

/**
 * `symbols/index.json` — the shard manifest and the two global lookup tables.
 *
 * The lookup tables stay whole because they are what make resolution work and every lookup may
 * touch any crate; only the symbol records, which are the bulk, are sharded.
 */
export interface SymbolIndexFile {
  readonly schemaVersion: number;
  readonly shards: readonly SymbolShard[];
  readonly paths: Readonly<Record<string, string>>;
  readonly names: Readonly<Record<string, readonly string[]>>;
}

/** A symbol reduced to what a search box needs: enough to match and to link. */
export interface SearchEntry {
  /** Bare name. */
  readonly name: string;
  /** Path a reader would write, preferring a facade re-export. */
  readonly path: string;
  readonly kind: string;
  readonly crate: string;
}

export interface SearchIndexFile {
  readonly schemaVersion: number;
  readonly symbols: readonly SearchEntry[];
}

/** `externals.json` — the reduced tier for symbols the framework does not define. */
export interface ExternalIndexFile {
  readonly schemaVersion: number;
  readonly symbols: readonly ExternalSymbol[];
  readonly names: Readonly<Record<string, readonly string[]>>;
  /** Crates the workspace depends on directly. Absent in an artifact written before it existed. */
  readonly direct: readonly string[];
  /** Framework paths that re-export another crate's item, mapped to that item. */
  readonly aliases: Readonly<Record<string, string>>;
}

/** Validates a parsed `externals.json`. Envelope only, as for the symbol shards. */
export function parseExternalIndexFile(value: unknown): ExternalIndexFile {
  const root = requireObject(value, "externals");

  return {
    schemaVersion: requirePositiveInteger(
      root.schemaVersion,
      "externals.schemaVersion",
    ),
    symbols: requireArray(
      root.symbols,
      "externals.symbols",
    ) as ExternalSymbol[],
    names: requireObject(root.names, "externals.names") as Record<
      string,
      string[]
    >,
    direct:
      root.direct === undefined
        ? []
        : requireStringArray(root.direct, "externals.direct"),
    aliases:
      root.aliases === undefined
        ? {}
        : (requireObject(root.aliases, "externals.aliases") as Record<
            string,
            string
          >),
  };
}

export interface CrateIndexFile {
  readonly schemaVersion: number;
  readonly crates: readonly CrateRecord[];
}

/** A structural problem in an artifact, reported with the field path that failed. */
export class ArtifactSchemaError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);

    this.name = "ArtifactSchemaError";
    this.path = path;
  }
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ArtifactSchemaError(path, "expected an object");
  }

  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ArtifactSchemaError(path, "expected an array");
  }

  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ArtifactSchemaError(path, "expected a non-empty string");
  }

  return value;
}

function requireNullableString(value: unknown, path: string): string | null {
  return value === null ? null : requireString(value, path);
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new ArtifactSchemaError(path, "expected a boolean");
  }

  return value;
}

function requireStringArray(value: unknown, path: string): string[] {
  return requireArray(value, path).map((entry, index) =>
    requireString(entry, `${path}[${index}]`),
  );
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ArtifactSchemaError(path, "expected a positive integer");
  }

  return value;
}

const CAPABILITIES: readonly ArtifactCapability[] = [
  "symbols",
  "crates",
  "search",
  "externals",
  "docs",
];

/**
 * Validates a parsed `manifest.json`.
 *
 * Artifacts are external input even when generated locally, so nothing here trusts the shape of
 * what it was handed. Validation is total for the manifest: every field the site reads is checked
 * once, at the boundary, rather than being defended against at each use.
 */
export function parseManifest(value: unknown): ArtifactManifest {
  const root = requireObject(value, "manifest");
  const schemaVersion = requirePositiveInteger(
    root.schemaVersion,
    "manifest.schemaVersion",
  );

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
    throw new ArtifactSchemaError(
      "manifest.schemaVersion",
      `artifact uses schema version ${schemaVersion}, but this site supports ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}. Regenerate the artifact, or upgrade the site.`,
    );
  }

  const framework = requireObject(root.framework, "manifest.framework");
  const documentation = requireObject(
    root.documentation,
    "manifest.documentation",
  );
  const git = requireObject(root.git, "manifest.git");
  const generator = requireObject(root.generator, "manifest.generator");
  const rust = requireObject(root.rust, "manifest.rust");
  const contents = requireObject(root.contents, "manifest.contents");
  const capabilities = requireStringArray(
    root.capabilities,
    "manifest.capabilities",
  );
  const origin = requireString(generator.origin, "manifest.generator.origin");

  for (const [index, capability] of capabilities.entries()) {
    if (!CAPABILITIES.includes(capability as ArtifactCapability)) {
      throw new ArtifactSchemaError(
        `manifest.capabilities[${index}]`,
        `unknown capability "${capability}"`,
      );
    }
  }

  for (const required of REQUIRED_CAPABILITIES) {
    if (!capabilities.includes(required)) {
      throw new ArtifactSchemaError(
        "manifest.capabilities",
        `missing required capability "${required}"`,
      );
    }
  }

  if (origin !== "local" && origin !== "release") {
    throw new ArtifactSchemaError(
      "manifest.generator.origin",
      `expected "local" or "release", got "${origin}"`,
    );
  }

  return {
    schemaVersion,
    framework: {
      name: requireString(framework.name, "manifest.framework.name"),
      crate: requireString(framework.crate, "manifest.framework.crate"),
      version: requireString(framework.version, "manifest.framework.version"),
      crates: requireStringArray(framework.crates, "manifest.framework.crates"),
    },
    documentation: {
      releaseVersion: requireString(
        documentation.releaseVersion,
        "manifest.documentation.releaseVersion",
      ),
      sourcePackageVersion: requireString(
        documentation.sourcePackageVersion,
        "manifest.documentation.sourcePackageVersion",
      ),
    },
    git: {
      sha: requireString(git.sha, "manifest.git.sha"),
      tag: requireNullableString(git.tag, "manifest.git.tag"),
      repository: requireString(git.repository, "manifest.git.repository"),
      dirty: requireBoolean(git.dirty, "manifest.git.dirty"),
    },
    generatedAt: requireString(root.generatedAt, "manifest.generatedAt"),
    generator: {
      name: requireString(generator.name, "manifest.generator.name"),
      version: requireString(generator.version, "manifest.generator.version"),
      origin,
      rustdocFormatVersion: requirePositiveInteger(
        generator.rustdocFormatVersion,
        "manifest.generator.rustdocFormatVersion",
      ),
    },
    rust: {
      toolchain: requireNullableString(
        rust.toolchain,
        "manifest.rust.toolchain",
      ),
      edition: requireString(rust.edition, "manifest.rust.edition"),
    },
    capabilities: capabilities as ArtifactCapability[],
    sourceLinkTemplate: requireString(
      root.sourceLinkTemplate,
      "manifest.sourceLinkTemplate",
    ),
    contents: {
      symbols: requireString(contents.symbols, "manifest.contents.symbols"),
      crates:
        contents.crates === undefined
          ? undefined
          : requireString(contents.crates, "manifest.contents.crates"),
      search:
        contents.search === undefined
          ? undefined
          : requireString(contents.search, "manifest.contents.search"),
      externals:
        contents.externals === undefined
          ? undefined
          : requireString(contents.externals, "manifest.contents.externals"),
    },
  };
}

/**
 * Validates a parsed `symbols/index.json`.
 *
 * The envelope and the shard list are checked, not every field of every symbol. Validating several
 * thousand records would cost real build time to defend against a corruption mode the archive
 * checksum already covers; the envelope catches the realistic failure, which is a file written by a
 * different generator version.
 */
export function parseSymbolIndexFile(value: unknown): SymbolIndexFile {
  const root = requireObject(value, "symbols");
  const schemaVersion = requirePositiveInteger(
    root.schemaVersion,
    "symbols.schemaVersion",
  );
  const shards = requireArray(root.shards, "symbols.shards").map(
    (entry, position) => {
      const shard = requireObject(entry, `symbols.shards[${position}]`);

      return {
        crate: requireString(shard.crate, `symbols.shards[${position}].crate`),
        file: requireString(shard.file, `symbols.shards[${position}].file`),
        count: requirePositiveInteger(
          shard.count,
          `symbols.shards[${position}].count`,
        ),
      };
    },
  );

  return {
    schemaVersion,
    shards,
    paths: requireObject(root.paths, "symbols.paths") as Record<string, string>,
    names: requireObject(root.names, "symbols.names") as Record<
      string,
      string[]
    >,
  };
}

/** Validates one parsed shard: a bare array of symbol records. */
export function parseSymbolShard(
  value: unknown,
  file: string,
): readonly Symbol[] {
  const symbols = requireArray(value, `symbols/${file}`);

  if (symbols.length > 0) {
    const first = requireObject(symbols[0], `symbols/${file}[0]`);

    requireString(first.path, `symbols/${file}[0].path`);
    requireString(first.kind, `symbols/${file}[0].kind`);
  }

  return symbols.map((value, index) => {
    const path = `symbols/${file}[${index}]`;
    const record = requireObject(value, path);

    if (record.procMacro !== undefined && record.procMacro !== null) {
      const procMacro = requireObject(record.procMacro, `${path}.procMacro`);
      const kind = requireString(procMacro.kind, `${path}.procMacro.kind`);

      if (kind !== "bang" && kind !== "attribute" && kind !== "derive") {
        throw new ArtifactSchemaError(
          `${path}.procMacro.kind`,
          "expected bang, attribute, or derive",
        );
      }

      requireStringArray(procMacro.helpers, `${path}.procMacro.helpers`);
    }

    const symbol = record as unknown as Symbol;

    return {
      ...symbol,
      docs: symbol.docs ?? null,
      procMacro: symbol.procMacro ?? null,
    };
  });
}

/** Validates a parsed `crates.json`. */
export function parseCrateIndexFile(value: unknown): CrateIndexFile {
  const root = requireObject(value, "crates");

  return {
    schemaVersion: requirePositiveInteger(
      root.schemaVersion,
      "crates.schemaVersion",
    ),
    crates: requireArray(root.crates, "crates.crates") as CrateRecord[],
  };
}

/** Expands a manifest's source link template for a file and line. */
export function sourceLink(
  manifest: ArtifactManifest,
  file: string,
  line?: number,
): string {
  return manifest.sourceLinkTemplate
    .replaceAll("{path}", file)
    .replaceAll("{line}", String(line ?? 1));
}
