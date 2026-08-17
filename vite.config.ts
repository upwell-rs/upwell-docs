import { mdsvex } from "mdsvex";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { docsConfig, docsManifest } from "@upwell/docs-vite";
import { docsPreprocessors } from "@upwell/docs-tools/render/preprocessors";
import { docsConfig as siteDocsConfig } from "./docs.config.ts";

const preprocessors = docsPreprocessors({
  config: siteDocsConfig,
  projectRoot: import.meta.dirname,
  versionModule: "#lib/docs/version.svelte",
});

export default defineConfig({
  plugins: [
    docsConfig(),

    // Before SvelteKit, so the manifest module resolves for the content modules that import it.
    docsManifest(),

    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
        experimental: { async: true },

        // Shiki marks a code block's `<pre>` focusable so a horizontally scrollable block can be
        // reached by keyboard, and the build gives it `role="region"` and a label — the pattern
        // WAI recommends. Svelte's rule does not accept `region` as a reason to be focusable, so
        // it fires on every code block. Filtered only for `.svx` pages, where the markup is
        // generated; the same warning still applies to hand-written components.
        // mdsvex emits `<script context="module">` for a page's frontmatter, which Svelte 5 has
        // deprecated. It is mdsvex's output, not ours, so the warning is noise until mdsvex
        // updates. Both filters are scoped to `.svx`, where the markup is generated; the same
        // warnings still apply to hand-written components.
        warningFilter: (warning) =>
          !(
            warning.filename?.endsWith(".svx") &&
            (warning.code === "a11y_no_noninteractive_tabindex" ||
              warning.code === "script_context_deprecated")
          ),
      },
      adapter: adapter(),
      preprocess: [
        // Before mdsvex, while the fences of an `<Example>` are still literal markdown: it reads
        // which blocks belong together so the highlighter can share their declarations.
        preprocessors.beforeMdsvex,

        mdsvex({
          extensions: [".svx", ".md"],
          // Every fenced code block goes through the shared Shiki highlighter and the symbol
          // index, at compile time. `optimise: false` keeps mdsvex from wrapping the result in
          // an `{@html}` template literal, which would mangle the symbol metadata attributes.
          highlight: {
            highlighter: preprocessors.highlighter,
            optimise: false,
          },
          rehypePlugins: [...preprocessors.rehypePlugins],
        }),

        // After mdsvex, so `<Symbol />` is literal text in the compiled source; before the
        // version preprocessor, whose declaration the links it emits depend on.
        preprocessors.afterMdsvex[0],

        // Declares the variable that symbol links' version expression reads.
        preprocessors.afterMdsvex[1],
      ],
      extensions: [".svelte", ".svx", ".md"],
      experimental: { remoteFunctions: true },
    }),
  ],
  test: {
    expect: { requireAssertions: true },
    projects: [
      {
        extends: "./vite.config.ts",
        test: {
          name: "client",
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium", headless: true }],
          },
          include: [
            "src/**/*.svelte.{test,spec}.{js,ts}",
            "packages/**/*.svelte.{test,spec}.{js,ts}",
          ],
          exclude: ["src/lib/server/**"],
        },
      },

      {
        extends: "./vite.config.ts",
        test: {
          name: "server",
          environment: "node",
          include: [
            "src/**/*.{test,spec}.{js,ts}",
            "packages/**/*.{test,spec}.{js,ts}",
          ],
          exclude: [
            "src/**/*.svelte.{test,spec}.{js,ts}",
            "packages/**/*.svelte.{test,spec}.{js,ts}",
          ],
        },
      },
    ],
  },
});
