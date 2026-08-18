/**
 * `docs:prepare` — make a framework release available to the documentation build.
 *
 * Usage:
 *
 * ```sh
 * bun run docs:prepare --local ../framework      # generate from a local checkout
 * bun run docs:prepare --local ../framework --external ../framework-axum
 * bun run docs:prepare --local ../framework --pack   # ...and also produce the release tarball
 * ```
 *
 * Whichever way an artifact arrives, it lands in the same cache directory in the same layout, and
 * the website reads it through the same code. There is deliberately no "just read the checkout
 * directly" mode: local documentation must be able to break in the same ways released
 * documentation can.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  isArtifactReadOnly,
  frameworkCrateVersion,
  frameworkCrates,
  type DocsConfig,
} from "@upwell/docs-core/config";
import { generateArtifact, GenerateError } from "./artifact/generate.ts";
import { artifactDir } from "./artifact/load.ts";
import { packArtifact } from "./artifact/pack.ts";
import { CheckoutError, readWorkspace } from "./artifact/workspace.ts";

interface Arguments {
  readonly config: string | null;
  readonly checkout: string | null;
  readonly externalCheckouts: readonly string[];
  readonly version: string | null;
  readonly pack: boolean;
  readonly reuseRustdoc: boolean;
  readonly help: boolean;
}

function parseArguments(argv: readonly string[]): Arguments {
  let config: string | null = null;
  let checkout: string | null = null;
  const externalCheckouts: string[] = [];
  let version: string | null = null;
  let pack = false;
  let reuseRustdoc = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--config") {
      config = argv[index + 1] ?? null;
      index += 1;

      continue;
    }

    if (argument === "--local") {
      checkout = argv[index + 1] ?? null;
      index += 1;

      continue;
    }

    if (argument === "--version") {
      version = argv[index + 1] ?? null;
      index += 1;

      continue;
    }

    if (argument === "--external") {
      const external = argv[index + 1];

      if (!external) {
        throw new Error('Missing path after "--external".');
      }

      externalCheckouts.push(external);
      index += 1;

      continue;
    }

    if (argument === "--pack") {
      pack = true;

      continue;
    }

    if (argument === "--reuse-rustdoc") {
      reuseRustdoc = true;

      continue;
    }

    if (argument === "--help" || argument === "-h") {
      help = true;

      continue;
    }

    throw new Error(`Unknown argument "${argument}". Run with --help.`);
  }

  return { config, checkout, externalCheckouts, version, pack, reuseRustdoc, help };
}

const USAGE = `
docs:prepare — prepare a framework documentation artifact.

  --config <file>     Site config module that exports docsConfig.
  --local <path>     Generate an artifact from a framework checkout.
                     Defaults to $FRAMEWORK_CHECKOUT when set.
	--external <path>  Add every public crate from another repository. Repeatable.
	  --version <ver>    Documentation release identity to prepare. Defaults to the
                     configured as latest in docs.config.ts.
  --pack             Also write dist/<name>-docs-<version>.tar.zst.
  --reuse-rustdoc    Reuse existing target/doc JSON instead of re-running
                     rustdoc. Much faster; only correct if the checkout has
                     not changed since it was last generated.
  --help             Show this message.

Generating an artifact runs nightly rustdoc over the whole framework
workspace, which takes minutes on a cold target directory. That is why
artifacts are cached per version rather than rebuilt per site build.

Downloading an artifact from a GitHub release is specified in
docs/architecture/framework-docs-artifact.md but not wired up yet: no release
publishes one. Use --local until it does.
`.trimStart();

async function main(): Promise<number> {
  const args = parseArguments(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(USAGE);

    return 0;
  }

  if (!args.config) {
    process.stderr.write(
      "No documentation config given. Run with --config ./docs.config.ts.\n",
    );

    return 1;
  }

  const configFile = path.resolve(process.cwd(), args.config);
  const configModule = (await import(configFile)) as {
    docsConfig?: DocsConfig;
  };
  const docsConfig = configModule.docsConfig;

  if (!docsConfig) {
    process.stderr.write(
      `Documentation config ${configFile} does not export docsConfig.\n`,
    );

    return 1;
  }

  const checkout = args.checkout ?? process.env.FRAMEWORK_CHECKOUT ?? null;

  if (!checkout) {
    process.stderr.write(
      "No framework checkout given.\n\n  bun run docs:prepare --local ../framework\n\nOr set FRAMEWORK_CHECKOUT to the checkout path.\n",
    );

    return 1;
  }

  const projectRoot = process.cwd();
  const workspace = await readWorkspace(path.resolve(checkout));
  const source = frameworkCrates(docsConfig).find((candidate) => candidate.crate === workspace.facadeCrate);
  const requested = args.version ?? source?.latest ?? null;

  if (!source || !requested) {
    process.stderr.write(
      `Workspace ${workspace.facadeCrate} is not registered in docsConfig.framework.\n`,
    );

    return 1;
  }

  const selected = frameworkCrateVersion(source, requested);

  if (!selected) {
    throw new GenerateError(`Repository ${source.crate} has no configured release "${requested}".`);
  }

  const releaseVersion = selected.releaseVersion.raw;
  const output = artifactDir(projectRoot, docsConfig.cacheDir, source.crate, releaseVersion);
  const registeredSources = frameworkCrates(docsConfig).map((crate) => ({
      crate: crate.crate,
      repository: crate.repository,
      versions: crate.versions.map((version) => version.releaseVersion.raw),
    }));

  if (isArtifactReadOnly(docsConfig, releaseVersion)) {
    process.stderr.write(
      `The ${requested} artifact is a read-only historical record and will not be regenerated.\n\n  Cache: ${path.relative(projectRoot, output)}\n\nOnly prepare a release not listed in docsConfig.readOnlyArtifactVersions.\n`,
    );

    return 1;
  }

  process.stdout.write(
    `Generating ${docsConfig.framework.name} docs artifact from ${checkout}\n`,
  );

  const result = await generateArtifact({
    checkout,
    externalCheckouts: args.externalCheckouts,
    outputDir: output,
    origin: "local",
    frameworkName: docsConfig.framework.name,
    rootCrate: source.crate,
    registeredSources,
    releaseVersion,
    reuseRustdoc: args.reuseRustdoc,
    directDependencyCrates: docsConfig.rustdoc.directDependencyCrates,
    standardLibraryCrates: docsConfig.rustdoc.standardLibraryCrates,
    onProgress: (message) => process.stdout.write(`  ${message}\n`),
  });

  process.stdout.write(
    `  release   ${result.manifest.documentation.releaseVersion}\n` +
      `  source    ${result.manifest.documentation.sourcePackageVersion}${result.manifest.git.dirty ? " (dirty checkout)" : ""}\n` +
      `  commit    ${result.manifest.git.sha.slice(0, 12)}${result.manifest.git.tag ? ` (${result.manifest.git.tag})` : ""}\n` +
      `  crates    ${result.crateCount} documented\n` +
      `  symbols   ${result.symbolCount} (${result.aliasCount} re-export paths)\n` +
      `  cache     ${path.relative(projectRoot, output)}\n`,
  );

  if (args.pack) {
    const distDir = path.join(projectRoot, "dist");

    await mkdir(distDir, { recursive: true });

    const archive = await packArtifact(
      output,
      distDir,
      source.crate,
      result.manifest.documentation.releaseVersion,
    );

    process.stdout.write(
      `  archive   ${path.relative(projectRoot, archive)}\n`,
    );
  }

  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((cause: unknown) => {
    const known =
      cause instanceof GenerateError || cause instanceof CheckoutError;

    process.stderr.write(
      `\n${known || cause instanceof Error ? (cause as Error).message : String(cause)}\n`,
    );
    process.exitCode = 1;
  });
