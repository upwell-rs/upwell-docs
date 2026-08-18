/**
 * Makes compiled page markup version-aware.
 *
 * A `.svx` file is compiled **once** but rendered for every release it applies to, so any URL baked
 * into that markup is fixed for all of them. Symbol links need the opposite: a reader on 0.20 who
 * clicks a symbol must land on 0.20's page for it, because a symbol can change enough between
 * releases to deserve different documentation.
 *
 * The escape from that is to emit a Svelte *expression* rather than a literal. mdsvex splices the
 * highlighter's HTML straight into the component source, so `{__docsVersion}` in an attribute is
 * compiled as an expression and evaluated per render — one compiled component, correct for every
 * release. This preprocessor is what puts `__docsVersion` in scope.
 *
 * It runs after mdsvex, and only touches pages that actually contain the expression, so a page with
 * no symbol links is left exactly as mdsvex produced it.
 */

import type { PreprocessorGroup } from "svelte/compiler";

/**
 * Placeholder the highlighter emits in place of a version.
 *
 * Deliberately an ordinary identifier. A control character would be tidier as a sentinel, but the
 * href passes through hast's HTML serialiser on the way out, which escapes control characters — so
 * the sentinel has to be something serialisation leaves alone.
 *
 * Collision is prevented by replacing it only within a symbol-link path (see `applyVersionExpression`),
 * not by the token being exotic.
 */
export const VERSION_SENTINEL = "__DOCS_VERSION__";

/** The expression the sentinel becomes, and the variable this preprocessor declares. */
export const VERSION_EXPRESSION = "{__docsVersion}";

function declaration(versionModule: string): string {
  return [
    "",
    "\t// Injected: symbol links resolve to the release being rendered, not the one that compiled.",
    `\timport { getDocsVersion as __getDocsVersion } from '${versionModule}';`,
    "\tconst __docsVersion = __getDocsVersion().id;",
  ].join("\n");
}

/** Matches an instance `<script>` — one without `module` or `context="module"`. */
const INSTANCE_SCRIPT =
  /<script(?![^>]*\b(?:module\b|context\s*=\s*["']module["']))([^>]*)>/;

/**
 * Declares `__docsVersion` in a page that references it.
 *
 * Two shapes to handle, both of which mdsvex produces: a page whose author wrote a `<script>`, and
 * a page with only the module script mdsvex generates for frontmatter. The second needs an instance
 * script created, because context can only be read during component initialisation.
 */
export function versionExpressionPreprocessor(
  versionModule: string,
): PreprocessorGroup {
  const injected = declaration(versionModule);

  return {
    markup: ({ content }) => {
      if (!content.includes(VERSION_EXPRESSION)) {
        return;
      }

      const existing = INSTANCE_SCRIPT.exec(content);

      if (existing) {
        const insertAt = existing.index + existing[0].length;

        return {
          code: content.slice(0, insertAt) + injected + content.slice(insertAt),
        };
      }

      return { code: `<script>${injected}\n</script>\n${content}` };
    },
  };
}

/**
 * Replaces version sentinels with the Svelte expression.
 *
 * Applied after Svelte escaping, so the braces it introduces survive: escaping exists to stop code
 * *content* being read as expressions, and this is the one place an expression is intended.
 *
 * Matched as a whole symbol-link path rather than as a bare token, so a page that happens to
 * contain the sentinel in its own code is untouched.
 */
export function applyVersionExpression(html: string): string {
  return html.replace(
    new RegExp(`(/docs/[^/]+/)${VERSION_SENTINEL}(/symbols/)`, "g"),
    `$1${VERSION_EXPRESSION}$2`,
  );
}
