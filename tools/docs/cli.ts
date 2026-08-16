/**
 * `docs:prepare` — make a framework release available to the documentation build.
 *
 * Usage:
 *
 * ```sh
 * bun run docs:prepare --local ../framework      # generate from a local checkout
 * bun run docs:prepare --local ../framework --pack   # ...and also produce the release tarball
 * ```
 *
 * Whichever way an artifact arrives, it lands in the same cache directory in the same layout, and
 * the website reads it through the same code. There is deliberately no "just read the checkout
 * directly" mode: local documentation must be able to break in the same ways released
 * documentation can.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { docsConfig, resolveVersion } from '../../src/lib/docs/config.ts';
import { generateArtifact, GenerateError } from './artifact/generate.ts';
import { artifactDir } from './artifact/load.ts';
import { packArtifact } from './artifact/pack.ts';
import { CheckoutError } from './artifact/workspace.ts';

interface Arguments {
	readonly checkout: string | null;
	readonly version: string | null;
	readonly pack: boolean;
	readonly reuseRustdoc: boolean;
	readonly help: boolean;
}

function parseArguments(argv: readonly string[]): Arguments {
	let checkout: string | null = null;
	let version: string | null = null;
	let pack = false;
	let reuseRustdoc = false;
	let help = false;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === '--local') {
			checkout = argv[index + 1] ?? null;
			index += 1;

			continue;
		}

		if (argument === '--version') {
			version = argv[index + 1] ?? null;
			index += 1;

			continue;
		}

		if (argument === '--pack') {
			pack = true;

			continue;
		}

		if (argument === '--reuse-rustdoc') {
			reuseRustdoc = true;

			continue;
		}

		if (argument === '--help' || argument === '-h') {
			help = true;

			continue;
		}

		throw new Error(`Unknown argument "${argument}". Run with --help.`);
	}

	return { checkout, version, pack, reuseRustdoc, help };
}

const USAGE = `
docs:prepare — prepare a framework documentation artifact.

  --local <path>     Generate an artifact from a framework checkout.
                     Defaults to $FRAMEWORK_CHECKOUT when set.
  --version <ver>    Framework version to prepare. Defaults to the version
                     configured as latest in src/lib/docs/config.ts.
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

	const checkout = args.checkout ?? process.env.FRAMEWORK_CHECKOUT ?? null;

	if (!checkout) {
		process.stderr.write(
			'No framework checkout given.\n\n  bun run docs:prepare --local ../framework\n\nOr set FRAMEWORK_CHECKOUT to the checkout path.\n'
		);

		return 1;
	}

	const projectRoot = process.cwd();
	const requested = args.version ?? resolveVersion(docsConfig, docsConfig.latest)?.frameworkVersion.raw ?? null;

	if (!requested) {
		process.stderr.write('docsConfig.latest does not resolve to a configured version.\n');

		return 1;
	}

	const output = artifactDir(projectRoot, docsConfig.cacheDir, requested);

	process.stdout.write(`Generating ${docsConfig.framework.name} docs artifact from ${checkout}\n`);

	const result = await generateArtifact({
		checkout,
		outputDir: output,
		origin: 'local',
		frameworkName: docsConfig.framework.name,
		tagPrefix: `${docsConfig.framework.crate}-v`,
		reuseRustdoc: args.reuseRustdoc,
		directDependencyCrates: docsConfig.rustdoc.directDependencyCrates,
		standardLibraryCrates: docsConfig.rustdoc.standardLibraryCrates,
		onProgress: (message) => process.stdout.write(`  ${message}\n`)
	});

	if (result.manifest.framework.version !== requested) {
		process.stderr.write(
			`\nCheckout is at ${result.manifest.framework.version}, but ${requested} was requested.\n\nEither check out ${docsConfig.framework.releaseTag(requested)} in ${checkout}, or add ${result.manifest.framework.version} to docsConfig.versions.\n`
		);

		return 1;
	}

	process.stdout.write(
		`  version   ${result.manifest.framework.version}${result.manifest.git.dirty ? ' (dirty checkout)' : ''}\n` +
		`  commit    ${result.manifest.git.sha.slice(0, 12)}${result.manifest.git.tag ? ` (${result.manifest.git.tag})` : ''}\n` +
		`  crates    ${result.crateCount} documented\n` +
		`  symbols   ${result.symbolCount} (${result.aliasCount} re-export paths)\n` +
		`  cache     ${path.relative(projectRoot, output)}\n`
	);

	if (args.pack) {
		const distDir = path.join(projectRoot, 'dist');

		await mkdir(distDir, { recursive: true });

		const archive = await packArtifact(output, distDir, docsConfig.framework.crate, result.manifest.framework.version);

		process.stdout.write(`  archive   ${path.relative(projectRoot, archive)}\n`);
	}

	return 0;
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((cause: unknown) => {
		const known = cause instanceof GenerateError || cause instanceof CheckoutError;

		process.stderr.write(`\n${known || cause instanceof Error ? (cause as Error).message : String(cause)}\n`);
		process.exitCode = 1;
	});
