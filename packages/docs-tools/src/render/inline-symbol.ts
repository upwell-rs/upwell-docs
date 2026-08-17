/**
 * `<Symbol />` — a framework symbol referenced in prose.
 *
 * ```svx
 * The <Symbol path="framework::http::RequestContext" /> scope lives for one request.
 * ```
 *
 * Renders with the same syntax highlighting, hover card, and link to the symbol's page that the
 * identifier would get inside a code block. A type mentioned in a sentence is the same thing as a
 * type mentioned in a snippet, and a reader has no reason to expect less of it.
 *
 * **It is build-time syntax, not a component.** A component's props are runtime values, and every
 * part of this — the highlighting, the symbol metadata, whether the symbol exists at all — is
 * resolved while the page compiles. So the tag is replaced before Svelte ever sees it, by a
 * preprocessor running after mdsvex, in exactly the way code fences are handled.
 *
 * A `path` that no symbol matches fails the build. In prose the failure is otherwise invisible:
 * unlike a code block, where an unresolved identifier simply renders unlinked, a `<Symbol />` that
 * silently rendered as plain text would look deliberate.
 */

import type { PreprocessorGroup } from "svelte/compiler";

import { highlightInline, semanticKind } from "./highlight.ts";
import type { RenderContext } from "./highlight.ts";
import { applyVersionExpression } from "./version-expression.ts";

/** Matches a self-closing `<Symbol … />` tag and captures its attributes. */
const SYMBOL_TAG = /<Symbol\s+([^>]*?)\/>/g;

/** Matches `name="value"` or `name` within a tag's attributes. */
const ATTRIBUTE = /([a-zA-Z-]+)(?:=(?:"([^"]*)"|'([^']*)'))?/g;

/** A `<Symbol />` that cannot be rendered. */
export class InlineSymbolError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "InlineSymbolError";
  }
}

interface SymbolAttributes {
  path?: string;
  /** Show the whole path rather than the final segment. */
  full?: boolean;
  /** Replace the rendered text entirely. */
  label?: string;
}

function parseAttributes(source: string): SymbolAttributes {
  const attributes: SymbolAttributes = {};

  for (const match of source.matchAll(ATTRIBUTE)) {
    const [, name, quoted, singleQuoted] = match;
    const value = quoted ?? singleQuoted;

    if (name === "path") {
      attributes.path = value;
    } else if (name === "label") {
      attributes.label = value;
    } else if (name === "full") {
      attributes.full = true;
    }
  }

  return attributes;
}

/** The text shown for a reference. */
function displayText(path: string, attributes: SymbolAttributes): string {
  if (attributes.label !== undefined) {
    return attributes.label;
  }

  return attributes.full ? path : (path.split("::").pop() ?? path);
}

/**
 * Renders one reference to HTML.
 *
 * The markup deliberately matches what the code-block transformer emits — same `data-symbol-*`
 * attributes, same `symbol` class — so the hover card, the deprecation styling and the keyboard
 * behaviour all work on it without knowing it came from prose.
 */
async function render(
  path: string,
  attributes: SymbolAttributes,
  context: RenderContext,
): Promise<string> {
  const canonical = context.index?.paths[path];
  const symbol = canonical ? context.index?.symbols.get(canonical) : undefined;

  if (!canonical || !symbol) {
    throw new InlineSymbolError(
      `<Symbol path="${path}" /> does not resolve.\n\n  ${describeMiss(path, context)}\n\nA symbol referenced in prose must exist, because unlike an identifier in a code block there is no sensible way to render it unlinked.`,
    );
  }

  const text = displayText(path, attributes);
  // Symbol pages are keyed by canonical identity, so the same authored reference is found whether
  // prose spells a symbol through the facade or through its defining crate.
  const documented = context.docsHref?.(canonical);
  const properties: Record<string, string> = {
    class: "symbol",
    "data-symbol": path,
    "data-symbol-kind": symbol.kind,
    "data-lens": semanticKind(symbol.kind),
  };

  assign(properties, "data-symbol-signature", symbol.signature);
  assign(properties, "data-symbol-doc", symbol.doc);
  assign(properties, "data-symbol-feature", symbol.feature);
  assign(
    properties,
    "data-symbol-source",
    context.sourceHref?.(symbol) ?? null,
  );

  if (symbol.deprecation) {
    properties["data-symbol-deprecated"] =
      symbol.deprecation.note ?? "This API is deprecated.";
  }

  if (documented) {
    properties.href = documented.href;
    properties["data-symbol-docs-title"] = documented.title;
  }

  const attributeSource = Object.entries(properties)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ");

  const tagName = documented ? "a" : "span";
  const highlighted = escapeSvelteBraces(await highlightInline(text));
  const html = `<code class="symbol-ref"><${tagName} ${attributeSource}>${highlighted}</${tagName}></code>`;

  // After escaping, so the braces this introduces survive: the link's version is an expression
  // evaluated per render, exactly as in a code block.
  return applyVersionExpression(html);
}

/** Explains a miss the way the build-time symbol page check does. */
function describeMiss(path: string, context: RenderContext): string {
  const name = path.split("::").pop() ?? path;
  const candidates = context.index?.names[name] ?? [];

  if (candidates.length > 0) {
    return `No symbol is reachable at that path. "${name}" is defined at: ${candidates.join(", ")}.`;
  }

  return "No symbol of that name exists in the documented release.";
}

function assign(
  properties: Record<string, string>,
  key: string,
  value: string | null | undefined,
): void {
  if (value) {
    properties[key] = value;
  }
}

/**
 * Escapes an attribute value for HTML *and* for Svelte.
 *
 * Doc summaries routinely contain braces and backticks, which Svelte would otherwise read as an
 * expression or a template literal in the middle of an attribute.
 */
function escapeAttribute(value: string): string {
  return escapeSvelteBraces(
    value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;"),
  );
}

/**
 * Neutralises the characters Svelte treats as syntax.
 *
 * Applied to the generated fragment only, never to the page: escaping a whole page would destroy
 * the expressions its author wrote deliberately.
 */
function escapeSvelteBraces(value: string): string {
  return value
    .replaceAll("{", "&#123;")
    .replaceAll("}", "&#125;")
    .replaceAll("`", "&#96;");
}

/**
 * Replaces every `<Symbol />` in a compiled page.
 *
 * Runs after mdsvex, so the tag is literal text in the component source, and before the
 * version-expression preprocessor, whose declaration the emitted link depends on.
 */
export function inlineSymbolPreprocessor(
  context: () => Promise<RenderContext>,
): PreprocessorGroup {
  return {
    markup: async ({ content, filename }) => {
      if (!content.includes("<Symbol")) {
        return;
      }

      const resolved = await context();
      const matches = [...content.matchAll(SYMBOL_TAG)];
      let code = content;

      for (const match of matches) {
        const attributes = parseAttributes(match[1]);

        if (!attributes.path) {
          throw new InlineSymbolError(
            `<Symbol /> without a path in ${filename ?? "a page"}.\n\nWrite <Symbol path="framework::http::RequestContext" />.`,
          );
        }

        try {
          code = code.replace(
            match[0],
            await render(attributes.path, attributes, resolved),
          );
        } catch (cause) {
          if (cause instanceof InlineSymbolError) {
            throw new InlineSymbolError(
              `${cause.message}\n\n  Page:\n    ${filename ?? "unknown"}`,
            );
          }

          throw cause;
        }
      }

      return { code };
    },
  };
}
