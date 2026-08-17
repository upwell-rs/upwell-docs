import type { PreprocessorGroup } from "svelte/compiler";

import type { DocsConfig } from "@upwell/docs-core/config";

import { exampleContextPreprocessor } from "./example-context.ts";
import { rehypeHeadingAnchors } from "./headings.ts";
import { inlineSymbolPreprocessor } from "./inline-symbol.ts";
import { docsRenderer } from "./mdsvex.ts";
import { versionExpressionPreprocessor } from "./version-expression.ts";

export interface DocsPreprocessorOptions {
  readonly config: DocsConfig;
  readonly projectRoot: string;
  readonly symbolsDir?: string;
  readonly versionModule: string;
}

export interface DocsPreprocessors {
  readonly beforeMdsvex: PreprocessorGroup;
  readonly highlighter: ReturnType<typeof docsRenderer>["docsHighlighter"];
  readonly rehypePlugins: readonly (typeof rehypeHeadingAnchors)[];
  readonly afterMdsvex: readonly PreprocessorGroup[];
}

/** Creates the ordered docs preprocessing phases for one Vite application. */
export function docsPreprocessors(
  options: DocsPreprocessorOptions,
): DocsPreprocessors {
  const renderer = docsRenderer(options);

  return {
    beforeMdsvex: exampleContextPreprocessor(),
    highlighter: renderer.docsHighlighter,
    rehypePlugins: [rehypeHeadingAnchors],
    afterMdsvex: [
      inlineSymbolPreprocessor(renderer.getContext),
      versionExpressionPreprocessor(options.versionModule),
    ],
  };
}
