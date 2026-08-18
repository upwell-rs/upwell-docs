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

import path from "node:path";
import process from "node:process";

import { latestVersion, resolveSymbolPagesConfig, type DocsConfig } from "@upwell/docs-core/config";
import { artifactDir, loadArtifact } from "../artifact/load.ts";
import { sourceLink } from "../artifact/schema.ts";
import type { Symbol } from "../rustdoc/symbols.ts";
import { resolveSymbolPages } from "../validate.ts";
import { renderCodeBlock, type RenderContext } from "./highlight.ts";
import { createResolverIndex } from "./resolution.ts";
import { VERSION_SENTINEL } from "./version-expression.ts";

/** Where authored guides live, relative to the project root. */
export const CONTENT_DIR = path.join("src", "content", "docs");

/** Where hand-written symbol pages live, relative to the project root. */
export const SYMBOLS_DIR = path.join("src", "content", "symbols");

export interface DocsRenderOptions {
  readonly config: DocsConfig;
  readonly projectRoot: string;
  readonly guidesDir?: string;
  readonly symbolsDir?: string;
  readonly building?: boolean;
}

export interface DocsRenderer {
  readonly getContext: () => Promise<RenderContext>;
  readonly docsHighlighter: (
    code: string,
    language: string | null | undefined,
    meta: string | null | undefined,
  ) => Promise<string>;
  readonly resetContext: () => void;
}

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
export function docsRenderer(options: DocsRenderOptions): DocsRenderer {
  let context: Promise<RenderContext> | undefined;
  const symbolsDir = options.symbolsDir ?? SYMBOLS_DIR;

  async function buildContext(): Promise<RenderContext> {
    const version = latestVersion(options.config);
    const artifactVersion = version.releaseVersion.raw;
    const root = artifactDir(
      options.projectRoot,
      options.config.cacheDir,
      options.config.framework.root.crate,
      artifactVersion,
    );

    const artifact = await loadArtifact(root, artifactVersion).catch(
      (cause: unknown) => {
        process.stderr.write(
          `\n[docs] No artifact for ${artifactVersion}; code blocks will be highlighted but not annotated.\n` +
            `[docs] Run: bun run docs:prepare --local ../framework\n\n${cause instanceof Error ? cause.message : String(cause)}\n\n`,
        );

        return null;
      },
    );

    if (!artifact) {
      return {};
    }

    const symbolPages = await resolveSymbolPages(
      artifact,
      path.join(options.projectRoot, symbolsDir),
      options.projectRoot,
      version.releaseVersion,
    );
    const policy = resolveSymbolPagesConfig(
      options.config.rustdoc,
      artifact.manifest.framework.crates,
      options.building ?? false,
    );
    const symbols = new Map(
      artifact.index.symbols.map((symbol) => [symbol.path, symbol]),
    );

    return {
      index: createResolverIndex(artifact.index),
      docsHref: (symbolPath) => {
        const canonical = artifact.index.paths[symbolPath] ?? symbolPath;
        const page = symbolPages.get(canonical);

        if (page) {
          return {
            href: `/docs/${options.config.framework.root.crate}/${VERSION_SENTINEL}/symbols/${page.segments}`,
            title: page.symbol.split("::").pop() ?? page.symbol,
          };
        }

        const symbol = symbols.get(canonical);

        return symbol && policy.enabled && (policy.crates === null || policy.crates.has(symbol.crate))
          ? {
              href: `/docs/${options.config.framework.root.crate}/${VERSION_SENTINEL}/symbols/${canonical.replaceAll("::", "/")}`,
              title: symbol.name,
            }
          : undefined;
      },
      sourceHref: (symbol: Symbol) =>
        symbol.source
          ? sourceLink(
              artifact.manifest,
              symbol.source.file,
              symbol.source.line,
              symbol.crate,
            )
          : null,
    };
  }

  return {
    getContext: () => {
      context ??= buildContext();

      return context;
    },
    docsHighlighter: async (code, language, meta) =>
      renderCodeBlock(
        code,
        language ?? "text",
        meta,
        await (context ??= buildContext()),
      ),
    resetContext: () => {
      context = undefined;
    },
  };
}
