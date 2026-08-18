/**
 * Workspace facts, read from `cargo metadata`.
 *
 * Cargo is the authority on what a workspace contains, so the generator asks it rather than reading
 * manifests itself. This does mean generating an artifact requires a Cargo toolchain — which is
 * fine, because generating one already requires a framework checkout. The website build consumes
 * the generated artifact and needs no Rust at all.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);

/** A `cargo metadata` or `git` invocation that failed while inspecting the checkout. */
export class CheckoutError extends Error {
  readonly checkout: string;

  constructor(checkout: string, message: string) {
    super(message);

    this.name = "CheckoutError";
    this.checkout = checkout;
  }
}

/** One workspace crate, as the artifact records it. */
export interface CrateInfo {
  readonly name: string;
  readonly version: string;
  readonly description: string | null;
  /** False for examples and test-support crates, which are not part of the public surface. */
  readonly published: boolean;
  /** Cargo features, each mapped to the features it enables. */
  readonly features: Readonly<Record<string, readonly string[]>>;
  /** Manifest directory, relative to the workspace root. */
  readonly path: string;
}

/**
 * Crate names the workspace depends on directly, as module names.
 *
 * Read from `[workspace.dependencies]`, which is where this framework declares them. Used to decide
 * when a name shared with the standard library is genuinely ambiguous: `Path` is `std::path::Path`
 * and also `axum::extract::Path`, and axum being a declared dependency is exactly what says the
 * second reading is plausible in a snippet — whereas `const_oid` sharing the name `Arc` does not.
 */
export async function readDirectDependencies(
  checkout: string,
): Promise<string[]> {
  const manifest = await readFile(
    path.join(checkout, "Cargo.toml"),
    "utf8",
  ).catch(() => "");
  const table =
    /^\[workspace\.dependencies\]$([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(
      manifest,
    );

  if (!table) {
    return [];
  }

  const names = new Set<string>();

  for (const line of table[1].split(/\r?\n/)) {
    const entry = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line);

    if (entry) {
      names.add(entry[1].replaceAll("-", "_"));
    }
  }

  return [...names].sort();
}

export interface WorkspaceInfo {
  readonly version: string;
  readonly edition: string;
  readonly repository: string;
  readonly facadeCrate: string;
  readonly crates: readonly CrateInfo[];
}

interface CargoPackage {
  name: string;
  version: string;
  edition: string;
  description: string | null;
  repository: string | null;
  publish: string[] | null;
  features: Record<string, string[]>;
  manifest_path: string;
  id: string;
}

interface CargoMetadata {
  packages: CargoPackage[];
  workspace_members: string[];
  workspace_root: string;
}

/**
 * Reads the workspace through `cargo metadata`.
 *
 * `--no-deps` keeps the answer to workspace members only; the artifact documents the framework, not
 * its dependency tree.
 */
export async function readWorkspace(checkout: string): Promise<WorkspaceInfo> {
  const metadata = await cargoMetadata(checkout);
  const members = new Set(metadata.workspace_members);
  const packages = metadata.packages.filter((entry) => members.has(entry.id));
  const facade = packages.find(
    (entry) => path.dirname(entry.manifest_path) === metadata.workspace_root,
  );

  if (!facade) {
    throw new CheckoutError(
      checkout,
      "The workspace root is not itself a package. The generator expects the root manifest to be the facade crate.",
    );
  }

  const crates = packages
    .map((entry) => toCrateInfo(entry, metadata.workspace_root))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    version: facade.version,
    edition: facade.edition,
    repository: facade.repository ?? "",
    facadeCrate: facade.name,
    crates,
  };
}

function toCrateInfo(entry: CargoPackage, workspaceRoot: string): CrateInfo {
  const directory = path.dirname(entry.manifest_path);
  const relative = path
    .relative(workspaceRoot, directory)
    .split(path.sep)
    .join("/");

  return {
    name: entry.name,
    version: entry.version,
    description: entry.description,
    // Cargo reports `publish = false` as an empty allow-list; absent means publishable anywhere.
    published: entry.publish === null || entry.publish.length > 0,
    features: entry.features,
    path: relative === "" ? "." : relative,
  };
}

async function cargoMetadata(checkout: string): Promise<CargoMetadata> {
  const result = await run(
    "cargo",
    ["metadata", "--no-deps", "--format-version", "1"],
    {
      cwd: checkout,
      maxBuffer: 64 * 1024 * 1024,
    },
  ).catch((cause: unknown) => {
    throw new CheckoutError(
      checkout,
      `Could not run "cargo metadata" in ${checkout}. Generating an artifact needs a Cargo toolchain and a valid workspace.\n\n${describe(cause)}`,
    );
  });

  return JSON.parse(result.stdout) as CargoMetadata;
}

/** Commit identity of the checkout an artifact was generated from. */
export interface GitInfo {
  readonly sha: string;
  readonly tag: string | null;
  readonly dirty: boolean;
}

export interface GitSourceFile {
  readonly path: string;
  readonly bytes: number;
}

/** Lists regular files from the captured commit without traversing the mutable checkout. */
export async function readGitSourceFiles(
  checkout: string,
  sha: string,
): Promise<GitSourceFile[]> {
  const listing = await git(checkout, ["ls-tree", "-r", "-l", "--full-tree", sha]);
  const files: GitSourceFile[] = [];

  for (const line of listing.split("\n")) {
    const match = /^100\d{3} blob [0-9a-f]+\s+(\d+)\t(.+)$/.exec(line);

    if (match) {
      files.push({ path: match[2], bytes: Number(match[1]) });
    }
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Reads the checkout's commit, its release tag if it sits exactly on one, and whether it is dirty.
 *
 * A dirty checkout is allowed for local development — that is the whole point of the local mode —
 * but it is recorded in the manifest so a release artifact can be rejected for it.
 */
export async function readGit(
  checkout: string,
  tagPrefix: string,
): Promise<GitInfo> {
  const sha = await git(checkout, ["rev-parse", "HEAD"]);
  const status = await git(checkout, ["status", "--porcelain"]);
  const tags = await git(checkout, ["tag", "--points-at", "HEAD"]).catch(
    () => "",
  );

  const tag =
    tags
      .split("\n")
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0 && entry.startsWith(tagPrefix)) ?? null;

  return { sha, tag, dirty: status.trim().length > 0 };
}

/**
 * Runs one Git command in a checkout and returns its trimmed output.
 *
 * The buffer is raised because these commands describe whole repositories: `ls-tree -r` prints a
 * line per tracked file, which passes Node's 1 MiB default only for small ones and then fails
 * artifact generation on exactly the repositories a source inventory matters for.
 */
async function git(checkout: string, args: readonly string[]): Promise<string> {
  const result = await run("git", [...args], {
    cwd: checkout,
    maxBuffer: 64 * 1024 * 1024,
  }).catch(
    (cause: unknown) => {
      throw new CheckoutError(
        checkout,
        `Could not run "git ${args.join(" ")}" in ${checkout}.\n\n${describe(cause)}`,
      );
    },
  );

  return result.stdout.trim();
}

/** Best available nightly `rustc --version`, or null when no toolchain is on the path. */
/**
 * Sysroot of the nightly rustdoc runs under, which is where `rust-docs-json` unpacks.
 *
 * Asked of the toolchain rather than assumed, so it follows a `rust-toolchain.toml` override in the
 * checkout the same way the rustdoc run does.
 */
export async function readSysroot(checkout: string): Promise<string | null> {
  const result = await run("rustc", ["+nightly", "--print", "sysroot"], {
    cwd: checkout,
  }).catch(() => null);

  return result === null ? null : result.stdout.trim();
}

export async function readToolchain(checkout: string): Promise<string | null> {
  const result = await run("rustc", ["+nightly", "--version"], {
    cwd: checkout,
  }).catch(() => null);

  return result ? result.stdout.trim() : null;
}

/**
 * Produces rustdoc JSON for every workspace crate.
 *
 * rustdoc's JSON output is a nightly-only unstable feature, so this pins `+nightly` explicitly
 * rather than hoping the default toolchain happens to be one. `--all-features` matters: a symbol
 * behind an optional feature is invisible without it, and the documentation needs to describe the
 * whole surface, not the default one.
 *
 * This is the slow step — minutes on a cold target directory — and it is why artifacts are cached
 * rather than regenerated per build.
 */
export async function runRustdoc(checkout: string): Promise<void> {
  await run(
    "cargo",
    [
      "+nightly",
      "doc",
      "--no-deps",
      "--workspace",
      "--all-features",
      "-Zunstable-options",
      "--output-format",
      "json",
    ],
    { cwd: checkout, maxBuffer: 64 * 1024 * 1024 },
  ).catch((cause: unknown) => {
    throw new CheckoutError(
      checkout,
      `rustdoc JSON generation failed in ${checkout}.\n\nThis needs a nightly toolchain (\`rustup toolchain install nightly\`).\n\n${describe(cause)}`,
    );
  });
}

function describe(cause: unknown): string {
  if (cause instanceof Error) {
    const stderr = (cause as { stderr?: string }).stderr;

    return stderr ? `${cause.message}\n${stderr}` : cause.message;
  }

  return String(cause);
}
