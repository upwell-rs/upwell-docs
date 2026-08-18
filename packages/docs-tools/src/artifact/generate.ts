/**
 * Builds a documentation artifact from a framework checkout.
 *
 * This is the single producer of artifact content. A local checkout and a release tag go through
 * exactly the same code, so a page that renders in development renders identically from a release —
 * the only difference is which commit is checked out and what the manifest records about it.
 *
 * The framework repository is not involved beyond being checked out: everything here is derived
 * from `cargo metadata` and rustdoc, both of which the framework produces for its own sake.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildSymbolIndex,
  type RustdocInput,
  type Symbol,
} from "../rustdoc/symbols.ts";
import type { RustdocCrate } from "../rustdoc/types.ts";
import {
  ARTIFACT_SCHEMA_VERSION,
  type ArtifactCapability,
  type ArtifactManifest,
  type ArtifactOrigin,
  type SearchEntry,
  type SymbolShard,
} from "./schema.ts";
import { enrichFromStandardLibrary } from "../rustdoc/standard-library.ts";
import {
  type CrateInfo,
  readDirectDependencies,
  readGit,
  readGitSourceFiles,
  readToolchain,
  readSysroot,
  readWorkspace,
  runRustdoc,
} from "./workspace.ts";

/** Identity of this generator, recorded in every manifest it writes. */
export const GENERATOR = {
  name: "framework-docs-artifact",
  version: "0.1.0",
} as const;

/** Artifact-relative locations. Fixed for schema version 2. */
const LAYOUT = {
  manifest: "manifest.json",
  /** Directory: `index.json` plus one shard per crate. */
  symbols: "symbols",
  crates: "crates.json",
  search: "search.json",
  externals: "externals.json",
} as const;

export interface GenerateOptions {
  /** Path to the framework checkout. */
  readonly checkout: string;
  /** Additional repositories whose public crates belong in the same documentation surface. */
  readonly externalCheckouts?: readonly string[];
  /** Directory the artifact is written to. Replaced if it already exists. */
  readonly outputDir: string;
  /** How the artifact is being produced. Release artifacts additionally reject a dirty checkout. */
  readonly origin: ArtifactOrigin;
  /** Display name of the framework, e.g. `Framework`. */
  readonly frameworkName: string;
  /** Facade package at the root of the primary checkout. */
  readonly rootCrate: string;
  /** Registered repository workspaces, identified by each workspace's root Cargo package. */
  readonly registeredSources: readonly {
    readonly crate: string;
    readonly repository: string;
    readonly versions: readonly string[];
  }[];
  /** Public docs release the artifact represents; intentionally independent of Cargo package versions. */
  readonly releaseVersion: string;
  /** Skip running rustdoc and use whatever is already in `target/doc`. */
  readonly reuseRustdoc?: boolean;
  /** Crates from rust-docs-json whose full API data enriches external symbols. */
  readonly standardLibraryCrates: readonly string[];
  /** External crates treated as plausible imports for resolving ambiguous names in examples. */
  readonly directDependencyCrates: "workspace" | readonly string[];
  /** Progress reporting, so a multi-minute rustdoc run is not silent. */
  readonly onProgress?: (message: string) => void;
}

export interface GenerateResult {
  readonly manifest: ArtifactManifest;
  readonly outputDir: string;
  readonly crateCount: number;
  readonly symbolCount: number;
  readonly aliasCount: number;
}

/** A checkout that cannot produce a valid artifact. */
export class GenerateError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "GenerateError";
  }
}

export async function generateArtifact(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const checkout = path.resolve(options.checkout);
  const externalCheckouts = (options.externalCheckouts ?? []).map((entry) => path.resolve(entry));
  const report = options.onProgress ?? (() => {});

  const sources = await Promise.all([checkout, ...externalCheckouts].map(async (sourceCheckout, index) => {
    const [workspace, git] = await Promise.all([
      readWorkspace(sourceCheckout),
      readGit(sourceCheckout, ""),
    ]);

    return { checkout: sourceCheckout, workspace, git, primary: index === 0 };
  }));
  const primary = sources[0];
  const workspace = primary.workspace;
  const git = primary.git;

  const dirty = sources.find((source) => source.git.dirty);

  if (options.origin === "release" && dirty) {
    throw new GenerateError(
      `Refusing to build a release artifact from a dirty checkout (${dirty.checkout}). Commit or stash the changes, or generate with origin "local".`,
    );
  }

  assertUniqueCrates(sources);
  const sourcesByRoot = assertRegisteredSources(sources, options.registeredSources);

  if (!options.reuseRustdoc) {
    report(
      `running rustdoc for ${sources.length} ${sources.length === 1 ? "repository" : "repositories"} in parallel (nightly, all features)`,
    );

    await Promise.all(sources.map((source) => runRustdoc(source.checkout)));
  }

  const inputs = (await Promise.all(
    sources.map((source) => readRustdocOutput(source.checkout, source.workspace.crates)),
  )).flat();

  if (inputs.length === 0) {
    throw new GenerateError(
      `No rustdoc JSON found under ${path.join(checkout, "target/doc")}. Run the generator without --reuse-rustdoc, or produce it with:\n\n  cargo +nightly doc --no-deps --workspace --all-features -Zunstable-options --output-format json\n`,
    );
  }

  report(`indexing ${inputs.length} crates from ${sources.length} repositories`);

  const directDependencies =
    options.directDependencyCrates === "workspace"
      ? await readDirectDependencies(checkout)
      : [...options.directDependencyCrates];

  const index = buildSymbolIndex(inputs, {
    facadeCrate: workspace.facadeCrate,
    cratesByFeature: featureByCrate(workspace),
    directDependencies,
    // Every workspace member, not just the ones rustdoc produced output for: an unpublished crate
    // is still ours, and a new crate must not need this file edited.
    workspaceCrates: sources.flatMap((source) => source.workspace.crates.map((crate) => crate.name)),
  });

  // The standard library's own documentation, when the toolchain has it. Optional by design: a
  // fresh clone does not have the component, and a build without it must be no worse than before.
  const sysroot = await readSysroot(checkout);
  const enrichment = sysroot
    ? await enrichFromStandardLibrary(
        sysroot,
        new Map(index.externals.symbols.map((symbol) => [symbol.path, symbol])),
        options.standardLibraryCrates,
      )
    : {
        enriched: new Map(),
        skipped: "Could not determine the nightly sysroot.",
      };

  if (enrichment.skipped) {
    report(
      `standard library documentation not used — ${enrichment.skipped.split("\n")[0]}`,
    );
  } else {
    report(`enriched ${enrichment.enriched.size} standard library symbols`);
  }

  const externals = {
    ...index.externals,
    symbols: index.externals.symbols.map(
      (symbol) => enrichment.enriched.get(symbol.path) ?? symbol,
    ),
  };

  const toolchain = await readToolchain(checkout);
  const registrations = new Map(options.registeredSources.map((source) => [source.crate, source]));
  const rootRegistration = registrations.get(options.rootCrate);

  if (!rootRegistration) {
    throw new GenerateError(`Root Cargo crate "${options.rootCrate}" is not registered in framework.root.`);
  }

  const repository = rootRegistration.repository.replace(/\/+$/, "");
  const sourceLinkTemplates = Object.fromEntries(
    sources.flatMap((source) => {
      const registration = sourcesByRoot.get(source.workspace.facadeCrate)!;

      return source.workspace.crates.filter((crate) => crate.published).map((crate) => {
        const sourceRepository = registration.repository.replace(/\/+$/, "");

        return [crate.name, `${sourceRepository}/blob/${source.git.sha}/{path}#L{line}`];
      });
    }),
  );
  const artifactSources = await Promise.all(sources.map(async (source) => {
    const registration = sourcesByRoot.get(source.workspace.facadeCrate)!;

    return {
      crate: registration.crate,
      version: source.workspace.version,
      repository: registration.repository.replace(/\/+$/, ""),
      sha: source.git.sha,
      crates: source.workspace.crates.filter((crate) => crate.published).map((crate) => crate.name),
      primary: source.primary,
      files: await readGitSourceFiles(source.checkout, source.git.sha),
    };
  }));
  const capabilities: ArtifactCapability[] = [
    "symbols",
    "crates",
    "search",
    "externals",
    "docs",
    "sources",
  ];

  const manifest: ArtifactManifest = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    framework: {
      name: options.frameworkName,
      crate: options.rootCrate,
      version: workspace.version,
      crates: sources.flatMap((source) => source.workspace.crates.map((crate) => crate.name)),
    },
    documentation: {
      releaseVersion: options.releaseVersion,
      sourcePackageVersion: workspace.version,
    },
    git: { sha: git.sha, tag: git.tag, repository, dirty: git.dirty },
    generatedAt: new Date().toISOString(),
    generator: {
      name: GENERATOR.name,
      version: GENERATOR.version,
      origin: options.origin,
      rustdocFormatVersion: inputs[0].doc.format_version,
    },
    rust: { toolchain, edition: workspace.edition },
    capabilities,
    // Pinned to the exact commit rather than a branch, so a link from released documentation
    // keeps pointing at the code that documentation was built from.
    sourceLinkTemplate: `${repository}/blob/${git.sha}/{path}#L{line}`,
    sourceLinkTemplates,
    sources: artifactSources,
    contents: {
      symbols: LAYOUT.symbols,
      crates: LAYOUT.crates,
      search: LAYOUT.search,
      externals: LAYOUT.externals,
    },
  };

  await rm(options.outputDir, { recursive: true, force: true });
  await mkdir(path.join(options.outputDir, LAYOUT.symbols), {
    recursive: true,
  });

  const shards = await writeShards(
    path.join(options.outputDir, LAYOUT.symbols),
    index.symbols,
  );

  await writeJson(path.join(options.outputDir, LAYOUT.symbols, "index.json"), {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    shards,
    paths: index.paths,
    names: index.names,
  });

  await writeJson(path.join(options.outputDir, LAYOUT.search), {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    symbols: toSearchEntries(index),
  });

  // The reduced external tier: kind, path and documentation URL for everything the framework
  // mentions but does not define. Its own file because it is consulted for annotation and never
  // belongs in the shippable search index.
  await writeJson(path.join(options.outputDir, LAYOUT.externals), {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    symbols: externals.symbols,
    names: externals.names,
    direct: externals.direct,
    aliases: externals.aliases,
  });

  await writeJson(path.join(options.outputDir, LAYOUT.crates), {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    crates: sources.flatMap((source) => source.workspace.crates),
  });

  await writeJson(path.join(options.outputDir, LAYOUT.manifest), manifest);

  return {
    manifest,
    outputDir: options.outputDir,
    crateCount: inputs.length,
    symbolCount: index.symbols.length,
    aliasCount: Object.keys(index.paths).length - index.symbols.length,
  };
}

function assertUniqueCrates(
  sources: readonly { readonly checkout: string; readonly workspace: { readonly crates: readonly CrateInfo[] } }[],
): void {
  const owners = new Map<string, string>();

  for (const source of sources) {
    for (const crate of source.workspace.crates.filter((entry) => entry.published)) {
      const owner = owners.get(crate.name);

      if (owner) {
        throw new GenerateError(
          `Cargo crate "${crate.name}" is present in more than one documentation source.\n\n  ${owner}\n  ${source.checkout}\n\nEach crate must have exactly one owning repository.`,
        );
      }

      owners.set(crate.name, source.checkout);
    }
  }
}

function assertRegisteredSources(
  sources: readonly { readonly checkout: string; readonly workspace: { readonly crates: readonly CrateInfo[] } }[],
  registrations: GenerateOptions["registeredSources"],
): ReadonlyMap<string, GenerateOptions["registeredSources"][number]> {
  const registered = new Map(registrations.map((source) => [source.crate, source]));
  const discovered = new Set<string>();

  for (const source of sources) {
    const root = source.workspace.crates.find((crate) => crate.path === ".");

    if (!root) {
      throw new GenerateError(`Could not identify the root Cargo package in ${source.checkout}.`);
    }

    discovered.add(root.name);

    const registration = registered.get(root.name);

    if (!registration) {
      throw new GenerateError(
        `Cargo metadata identified workspace "${root.name}" in ${source.checkout}, but it is not registered as framework.root or in framework.crates.`,
      );
    }

    if (!registration.versions.includes(root.version)) {
      throw new GenerateError(
        `Workspace root crate "${root.name}" version ${root.version} is not configured.\n\n  Configured: ${registration.versions.join(", ")}\n  Source:     ${source.checkout}`,
      );
    }
  }

  const missing = registrations.filter((crate) => !discovered.has(crate.crate));

  if (missing.length > 0) {
    throw new GenerateError(
      `Registered framework repositories were not found in the supplied checkouts:\n\n${missing.map((source) => `  ${source.crate}`).join("\n")}\n\nSupply their workspaces with repeated --external <path> arguments.`,
    );
  }

  return registered;
}

/**
 * Reads the rustdoc JSON rustdoc wrote for each workspace crate.
 *
 * rustdoc names its output after the *module* name, so `framework-core` becomes `framework_core.json`.
 * Crates without output are skipped rather than treated as an error: proc-macro and binary-only
 * crates legitimately produce none.
 */
async function readRustdocOutput(
  checkout: string,
  crates: readonly CrateInfo[],
): Promise<RustdocInput[]> {
  const docDir = path.join(checkout, "target", "doc");
  const inputs: RustdocInput[] = [];

  for (const crate of crates) {
    // Examples and test-support crates are workspace members, but they are not the framework's
    // public surface. Indexing them would let an example's type shadow the real one when a snippet
    // names it, which is worse than not documenting them at all.
    if (!crate.published) {
      continue;
    }

    const file = path.join(docDir, `${crate.name.replaceAll("-", "_")}.json`);
    const contents = await readFile(file, "utf8").catch(() => null);

    if (contents === null) {
      continue;
    }

    inputs.push({
      crate: crate.name,
      file,
      doc: JSON.parse(contents) as RustdocCrate,
    });
  }

  return inputs;
}

/**
 * Maps each crate to the facade feature that pulls it in.
 *
 * The facade declares optional dependencies as `dep:framework-http` inside its feature table, which is
 * the only place the framework states this relationship. Reading it here is what lets a symbol be
 * labelled with the feature a reader must enable to reach it, without the framework annotating
 * anything for the documentation's benefit.
 */
function featureByCrate(workspace: {
  facadeCrate: string;
  crates: readonly CrateInfo[];
}): Record<string, string> {
  const facade = workspace.crates.find(
    (crate) => crate.name === workspace.facadeCrate,
  );
  const mapping: Record<string, string> = {};

  if (!facade) {
    return mapping;
  }

  for (const [feature, enables] of Object.entries(facade.features)) {
    if (feature === "default") {
      continue;
    }

    for (const entry of enables) {
      if (entry.startsWith("dep:")) {
        const crate = entry.slice("dep:".length);

        // A crate reachable through several features is labelled with the shortest one, which
        // is the one a reader is most likely to be told to enable.
        if (!mapping[crate] || feature.length < mapping[crate].length) {
          mapping[crate] = feature;
        }
      }
    }
  }

  return mapping;
}

/**
 * Writes one shard per crate.
 *
 * Sharding is for the consumer, not the build: the build reads every shard anyway. It exists so
 * that shipping symbol data to a browser later is a matter of sending the shards that are needed,
 * rather than one multi-megabyte blob that has to be sent whole or not at all.
 */
async function writeShards(
  symbolsDir: string,
  symbols: readonly Symbol[],
): Promise<SymbolShard[]> {
  const byCrate = new Map<string, Symbol[]>();

  for (const symbol of symbols) {
    (
      byCrate.get(symbol.crate) ??
      byCrate.set(symbol.crate, []).get(symbol.crate)!
    ).push(symbol);
  }

  const shards: SymbolShard[] = [];

  for (const crate of [...byCrate.keys()].sort()) {
    const records = byCrate.get(crate)!;
    const file = `${crate}.json`;

    await writeJson(path.join(symbolsDir, file), records);
    shards.push({ crate, file, count: records.length });
  }

  return shards;
}

/**
 * Reduces the index to what a search box needs.
 *
 * Each symbol is listed once, at the path a reader would write — the shortest facade re-export if
 * it has one. Listing every reachable path would multiply the index by the re-export count and fill
 * results with the same symbol under names nobody uses.
 */
function toSearchEntries(index: {
  symbols: readonly Symbol[];
  paths: Readonly<Record<string, string>>;
}): SearchEntry[] {
  const preferred = new Map<string, string>();

  for (const [reachable, canonical] of Object.entries(index.paths)) {
    const current = preferred.get(canonical);

    if (!current || isBetterPath(reachable, current)) {
      preferred.set(canonical, reachable);
    }
  }

  return index.symbols.map((symbol) => ({
    name: symbol.name,
    path: preferred.get(symbol.path) ?? symbol.path,
    kind: symbol.kind,
    crate: symbol.crate,
  }));
}

/** A path a reader is more likely to write: fewer segments first, then shorter. */
function isBetterPath(candidate: string, current: string): boolean {
  const bySegments = candidate.split("::").length - current.split("::").length;

  return (
    bySegments < 0 || (bySegments === 0 && candidate.length < current.length)
  );
}

async function writeJson(destination: string, value: unknown): Promise<void> {
  await writeFile(destination, `${JSON.stringify(value)}\n`, "utf8");
}
