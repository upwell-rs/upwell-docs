/**
 * The mdsvex bridge: turns every fenced code block in a `.svx` page into enriched HTML.
 *
 * mdsvex calls this once per fence, during compilation, in Node — which is exactly where the Shiki
 * highlighter and the symbol index already live. Doing the work here rather than in a component is
 * what makes a documentation page fully static: the browser receives finished markup and never
 * highlights, resolves or fetches anything.
 *
 * The artifact is loaded once per build, validated once, and shared by every block.
 */

import path from 'node:path';
import process from 'node:process';

import { docsConfig, latestVersion } from '../../../src/lib/docs/config.ts';
import { artifactDir, type LoadedArtifact, loadArtifact } from '../artifact/load.ts';
import { sourceLink } from '../artifact/schema.ts';
import type { Symbol } from '../rustdoc/symbols.ts';
import { resolveSymbolPages } from '../validate.ts';
import { renderCodeBlock, type RenderContext } from './highlight.ts';
import { VERSION_SENTINEL } from './version-expression.ts';
import type { ResolverIndex } from './resolve.ts';

/** Where authored guides live, relative to the project root. */
export const CONTENT_DIR = path.join('src', 'content', 'docs');

/** Where hand-written symbol pages live, relative to the project root. */
export const SYMBOLS_DIR = path.join('src', 'content', 'symbols');

let context: Promise<RenderContext> | undefined;

/**
 * Builds the render context once per build.
 *
 * A missing artifact is not fatal: pages still compile, with syntax highlighting but no symbol
 * annotation, and the reason is reported once. Failing the compile would leave a fresh clone unable
 * to run `dev` before running `docs:prepare`, which is a worse first experience than a page whose
 * hover cards are temporarily absent.
 *
 * A *present but inconsistent* artifact is fatal, because that is the failure worth catching: a
 * defined reference pointing at a symbol the release no longer has.
 */
export function getContext(): Promise<RenderContext> {
	context ??= buildContext();

	return context;
}

async function buildContext(): Promise<RenderContext> {
	const version = latestVersion(docsConfig);
	const projectRoot = process.cwd();
	const root = artifactDir(projectRoot, docsConfig.cacheDir, version.frameworkVersion.raw);

	const artifact = await loadArtifact(root, version.frameworkVersion.raw).catch((cause: unknown) => {
		process.stderr.write(
			`\n[docs] No artifact for ${version.frameworkVersion.raw}; code blocks will be highlighted but not annotated.\n` +
				`[docs] Run: bun run docs:prepare --local ../framework\n\n${cause instanceof Error ? cause.message : String(cause)}\n\n`
		);

		return null;
	});

	if (!artifact) {
		return {};
	}

	// Keyed by canonical path rather than by the alias someone happened to write, so a page written
	// at `framework/prelude/component` is found by a snippet that reached the same symbol through a
	// different re-export.
	const symbolPages = await resolveSymbolPages(artifact, path.join(projectRoot, SYMBOLS_DIR), projectRoot);

	return {
		index: toResolverIndex(artifact),
		docsHref: (symbolPath) => {
			const canonical = artifact.index.paths[symbolPath] ?? symbolPath;
			const page = symbolPages.get(canonical);

			if (!page) {
				return undefined;
			}

			// The version is a sentinel, not a literal: this markup is compiled once and rendered
			// for every release it applies to, so a fixed version would be wrong for all but one.
			// It becomes a Svelte expression evaluated per render — see `version-expression.ts`.
			return {
				href: `/docs/${VERSION_SENTINEL}/symbols/${page.segments}`,
				title: page.symbol.split('::').pop() ?? page.symbol
			};
		},
		sourceHref: (symbol: Symbol) => (symbol.source ? sourceLink(artifact.manifest, symbol.source.file, symbol.source.line) : null)
	};
}

function toResolverIndex(artifact: LoadedArtifact): ResolverIndex {
	return {
		paths: artifact.index.paths,
		names: artifact.index.names,
		symbols: new Map(artifact.index.symbols.map((symbol) => [symbol.path, symbol])),
		externals: {
			byPath: new Map(artifact.index.externals.symbols.map((symbol) => [symbol.path, symbol])),
			byName: artifact.index.externals.names,
			direct: new Set(artifact.index.externals.direct),
			aliases: artifact.index.externals.aliases
		}
	};
}

/**
 * mdsvex highlighter.
 *
 * `optimise` is ignored: the returned HTML is escaped for Svelte directly rather than wrapped in an
 * `{@html}` template literal, which keeps `data-*` attributes containing braces intact.
 */
export async function docsHighlighter(code: string, language: string | null | undefined, meta: string | null | undefined): Promise<string> {
	return renderCodeBlock(code, language ?? 'text', meta, await getContext());
}

/** Resets the cached context. Used by tests, which build their own. */
export function resetContext(): void {
	context = undefined;
}
