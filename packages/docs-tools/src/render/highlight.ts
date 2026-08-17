/**
 * The shared syntax-highlighting layer.
 *
 * One Shiki highlighter is created for the whole build and reused by every code block. Shiki loads
 * WebAssembly grammars and themes on creation, so per-block instantiation would dominate build time.
 *
 * Shiki answers only "how should this token look?". Meaning is layered on top by a transformer that
 * consults the symbol index, and the two never mix: no grammar scope is used to infer a symbol, and
 * no symbol changes a colour.
 */

import { transformerMetaHighlight } from "@shikijs/transformers";
import {
  createHighlighter,
  type Highlighter,
  type ShikiTransformer,
} from "shiki";

import type { ExternalSymbol, Symbol } from "../rustdoc/symbols.ts";
import { blockId } from "./block-id.ts";
import type { Declaration } from "./declarations.ts";
import { sharedContextFor } from "./example-context.ts";
import {
  isLocal,
  resolveExpressions,
  type ResolvedExpressions,
  type ResolvedExternalMember,
  type ResolvedVariable,
} from "./expression.ts";
import {
  externalFromScope,
  findExternal,
  readScope,
  type ResolvedToken,
  resolveToken,
  type ResolverIndex,
  type SnippetScope,
} from "./resolve.ts";
import { applyVersionExpression } from "./version-expression.ts";

/** Languages documentation is allowed to use. An unknown language is a build error, not plain text. */
export const LANGUAGES = [
  "rust",
  "toml",
  "bash",
  "shell",
  "typescript",
  "javascript",
  "json",
  "yaml",
  "text",
] as const;

export type Language = (typeof LANGUAGES)[number];

/**
 * Light and dark themes, rendered together.
 *
 * Shiki emits both colours per token as CSS custom properties, so the site switches theme with CSS
 * alone — no re-highlighting, no second copy of the markup, and no flash on load.
 */
export const THEMES = { light: "github-light", dark: "github-dark" } as const;

let highlighter: Promise<Highlighter> | undefined;

/** The build's single highlighter instance. */
export function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({
    themes: [THEMES.light, THEMES.dark],
    langs: [...LANGUAGES].filter((language) => language !== "text"),
  });

  return highlighter;
}

/** Everything a code block needs beyond the code itself. */
export interface RenderContext {
  /** Symbol index for the framework version the page documents, or undefined to skip enrichment. */
  readonly index?: ResolverIndex;
  /**
   * Where a symbol is documented on this site, if anywhere.
   *
   * Returning undefined is the normal case and means the symbol is annotated but not linked. The
   * site has no generated page per symbol, so a link exists only where someone wrote the page.
   */
  readonly docsHref?: (
    path: string,
  ) => { href: string; title: string } | undefined;
  /** Builds the repository URL for a symbol's definition. */
  readonly sourceHref?: (symbol: Symbol) => string | null;
}

/** Options parsed out of a fence's meta string. */
export interface CodeBlockMeta {
  readonly title?: string;
  readonly filename?: string;
  /** Suppress symbol enrichment for a block that is illustrative rather than real API usage. */
  readonly plain: boolean;
  /**
   * How much of the block to show.
   *
   * `context` contributes its declarations to the surrounding `<Example>` without being rendered at
   * all; `collapsed` renders it closed. Both exist for the same reason: an example usually needs a
   * data type and a couple of imports that are not what the example is *about*, and showing them in
   * full buries the three lines that are. Leaving them out entirely instead would break the code
   * lens for exactly the names the reader has not seen before.
   */
  readonly visibility: "shown" | "collapsed" | "context";
}

/** A fence whose language the site does not know how to render. */
export class UnknownLanguageError extends Error {
  constructor(language: string) {
    super(
      `Unknown code language "${language}".\n\nDocumentation may use: ${LANGUAGES.join(", ")}.\n\nAdd it to LANGUAGES in @upwell/docs-tools/render if it is genuinely needed — an unrecognised language is usually a typo, and silently rendering it unhighlighted hides that.`,
    );

    this.name = "UnknownLanguageError";
  }
}

/**
 * Parses a fence meta string.
 *
 * Supported forms, in any order and combination:
 *
 * ```text
 * ```rust title="Composing a router" filename=src/main.rs {3-5} plain
 * ```
 *
 * Line highlighting (`{3-5}`) is left in the meta string for Shiki's own transformer to read.
 */
export function parseMeta(meta: string | null | undefined): CodeBlockMeta {
  const source = meta ?? "";
  const title = /(?:^|\s)title=(?:"([^"]*)"|(\S+))/.exec(source);
  const filename = /(?:^|\s)filename=(?:"([^"]*)"|(\S+))/.exec(source);

  return {
    title: title ? (title[1] ?? title[2]) : undefined,
    filename: filename ? (filename[1] ?? filename[2]) : undefined,
    plain: /(?:^|\s)plain(?:\s|$)/.test(source),
    visibility: /(?:^|\s)context(?:\s|$)/.test(source)
      ? "context"
      : /(?:^|\s)collapsed(?:\s|$)/.test(source)
        ? "collapsed"
        : "shown",
  };
}

/**
 * Escapes highlighted HTML for embedding in a Svelte component.
 *
 * mdsvex splices the highlighter's output straight into the component source, where Svelte would
 * read `{` as the start of an expression and a backtick as a template literal. The entities survive
 * unchanged into the DOM, including inside attribute values, which is what lets symbol metadata
 * containing braces ride along in `data-*` attributes.
 */
export function escapeForSvelte(html: string): string {
  return html
    .replaceAll("{", "&#123;")
    .replaceAll("}", "&#125;")
    .replaceAll("`", "&#96;");
}

/**
 * Renders one code block to HTML.
 *
 * The returned markup is already Svelte-escaped and ready to be spliced into a page.
 */
export async function renderCodeBlock(
  code: string,
  language: string,
  meta: string | null | undefined,
  context: RenderContext = {},
): Promise<string> {
  const normalised = normaliseLanguage(language);
  const options = parseMeta(meta);

  // A context block is read for its declarations by the example preprocessor and then rendered as
  // nothing. It has to still be *written* as a code block, because that is what makes it real code
  // an author keeps correct rather than a note that drifts.
  if (options.visibility === "context") {
    return "";
  }

  const shiki = await getHighlighter();

  // Identifies this block within the page, so a use of a locally declared name can point at the
  // line that declares it. Derived from the code itself rather than from a counter: the same
  // snippet renders to the same id however the build happens to order its work.
  const block = blockId(code);

  const transformers: ShikiTransformer[] = [
    transformerMetaHighlight(),
    scrollableRegion(normalised, options),
    numberLines(block),
  ];

  if (normalised === "rust" && !options.plain && context.index) {
    transformers.push(symbolTransformer(code, context, context.index, block));
  }

  const html = shiki.codeToHtml(code.replace(/\n$/, ""), {
    lang: normalised === "text" ? "text" : normalised,
    themes: THEMES,
    defaultColor: false,
    cssVariablePrefix: "--shiki-",
    meta: { __raw: meta ?? "" },
    transformers,
  });

  // The version expression is restored after escaping: escaping stops code *content* being read as
  // a Svelte expression, and a symbol link's version is the one place an expression is intended.
  return applyVersionExpression(
    escapeForSvelte(wrap(html, normalised, options)),
  );
}

/**
 * Highlights a short Rust fragment for use inside a sentence.
 *
 * `structure: 'inline'` gives coloured spans with no `<pre>` or `<code>` wrapper, so a symbol
 * referenced in prose is coloured by the same themes as one inside a code block — the caller
 * supplies its own wrapper.
 */
export async function highlightInline(
  code: string,
  language: Language = "rust",
): Promise<string> {
  const shiki = await getHighlighter();

  return shiki.codeToHtml(code, {
    lang: language,
    themes: THEMES,
    defaultColor: false,
    cssVariablePrefix: "--shiki-",
    structure: "inline",
  });
}

function normaliseLanguage(language: string | null | undefined): Language {
  const candidate = (language ?? "text").toLowerCase();
  const aliases: Record<string, Language> = {
    sh: "shell",
    zsh: "shell",
    console: "shell",
    ts: "typescript",
    js: "javascript",
    rs: "rust",
    "": "text",
    plaintext: "text",
  };

  const resolved = aliases[candidate] ?? (candidate as Language);

  if (!LANGUAGES.includes(resolved)) {
    throw new UnknownLanguageError(candidate);
  }

  return resolved;
}

/**
 * Wraps Shiki's `<pre>` in the figure the site styles.
 *
 * The copy button is emitted as inert markup and wired up by one delegated listener on the article,
 * rather than mounted per block. A page with twenty code blocks then costs one listener instead of
 * twenty component instances, and the button is present in the prerendered HTML.
 */
function wrap(
  html: string,
  language: Language,
  options: CodeBlockMeta,
): string {
  const label = options.title ?? options.filename;
  const kind = options.filename && !options.title ? "filename" : "title";

  const caption = label
    ? `<figcaption class="code-block__caption" data-kind="${kind}">${escapeHtml(label)}</figcaption>`
    : "";

  const copy =
    '<button class="code-block__copy" type="button" data-copy aria-label="Copy code">Copy</button>';
  const figure = `<figure class="code-block" data-language="${language}">${caption}${copy}${html}</figure>`;

  if (options.visibility !== "collapsed") {
    return figure;
  }

  // `<details>` rather than a scripted toggle, for the reason the sidebar uses one: the browser's
  // own in-page find opens it to reveal a match, so hiding the block does not hide it from search.
  return `<details class="code-block__folded"><summary>${escapeHtml(label ?? "Supporting code")}</summary>${figure}</details>`;
}

/**
 * Gives each line an id, so a locally declared name can be jumped to.
 *
 * Only useful for the in-page definition jump, but cheap enough to emit unconditionally: one
 * attribute per line, on markup that is already there.
 */
function numberLines(block: string): ShikiTransformer {
  return {
    name: "framework:line-anchors",
    line(node, line) {
      node.properties.id = `L${block}-${line}`;
    },
  };
}

/**
 * Names the `<pre>` that Shiki marks focusable.
 *
 * Shiki adds `tabindex="0"` so a horizontally scrollable block can be reached by keyboard, which is
 * correct — but an unnamed focusable element with no role is a stop with nothing announced. Giving
 * it `role="region"` and a label makes it a named landmark, which is what a keyboard or screen
 * reader user needs, and is why the focusable `pre` is kept rather than stripped.
 */
function scrollableRegion(
  language: Language,
  options: CodeBlockMeta,
): ShikiTransformer {
  const label = options.title ?? options.filename ?? `${language} code`;

  return {
    name: "framework:scrollable-region",
    pre(node) {
      node.properties.role = "region";
      node.properties["aria-label"] = label;
    },
  };
}

/** Identifiers inside one Shiki token. */
const IDENTIFIERS = /[A-Za-z_][A-Za-z0-9_]*/g;

/** Tokens that are prose rather than code, where a resolved identifier would be a false positive. */
const PROSE_TOKEN = /^\s*(?:\/\/|\/\*|\*|"|r#")/;

/**
 * Attaches symbol metadata to the identifiers Shiki produced.
 *
 * Shiki's tokens are coloured runs, not identifiers: an attribute like `#[component(by_value)]` is a
 * single token, and an indented field carries its leading whitespace. Decorating whole tokens would
 * therefore miss every attribute macro and underline the indentation of everything else. Instead
 * each token's text is split, and only the identifiers that resolve become elements — the colour
 * stays on the parent span, so nothing about the highlighting changes.
 *
 * Two resolvers feed it, and the order matters. Members are resolved first, from a pass over the
 * whole snippet that knows what each expression's type is; a bare identifier is resolved second,
 * from the snippet's imports alone. The member pass is strictly better informed, so where both have
 * an answer it wins — but it only ever has one for a token written after a `.` or a `::`, which is
 * exactly where the lexical resolver has none.
 *
 * The metadata rides on the elements themselves rather than in a side-channel payload, so a
 * prerendered page is self-contained: the hover card needs no fetch, no hydration data and no lookup
 * table. Repeated identifiers repeat their metadata, which compresses away.
 */
function symbolTransformer(
  code: string,
  context: RenderContext,
  index: ResolverIndex,
  block: string,
): ShikiTransformer {
  const scope = readScope(code);
  const expressions = resolveExpressions(
    code,
    scope,
    index,
    sharedContextFor(code),
  );

  return {
    name: "framework:symbols",
    span(node, _line, _column, _lineElement, token) {
      const [child] = node.children;

      if (
        node.children.length !== 1 ||
        !child ||
        child.type !== "text" ||
        PROSE_TOKEN.test(child.value)
      ) {
        return;
      }

      const replaced = split(
        child.value,
        token.offset,
        scope,
        context,
        expressions,
        block,
      );

      if (replaced) {
        node.children = replaced;
      }
    },
  };
}

/** The hast node shapes this transformer builds. Structural only — Shiki owns the full types. */
type TokenChild =
  | { type: "text"; value: string }
  | {
      type: "element";
      tagName: string;
      properties: Record<string, string>;
      children: { type: "text"; value: string }[];
    };

/** Splits a token's text into plain text and symbol elements, or returns null if nothing resolved. */
function split(
  text: string,
  offset: number,
  scope: SnippetScope,
  context: RenderContext,
  expressions: ResolvedExpressions,
  block: string,
): TokenChild[] | null {
  // Shiki keeps a whole attribute in one token, so its text is the only place attribute position
  // can be observed — and that is what makes a bare `#[component]` safe to resolve. The attribute's
  // *name* is the first identifier after the bracket, and only it is restricted to macros.
  const attributeAt = text.indexOf("#[");
  const attribute = attributeAt !== -1;
  const nameAt = attribute
    ? /[A-Za-z_]/.exec(text.slice(attributeAt + 2))?.index
    : undefined;
  const attributeNameAt =
    nameAt === undefined ? undefined : attributeAt + 2 + nameAt;
  const parts: TokenChild[] = [];
  let consumed = 0;

  for (const match of text.matchAll(IDENTIFIERS)) {
    if (match.index === undefined) {
      continue;
    }

    // The `!` of a macro invocation lands inside the same token, so the character after the
    // identifier is all it takes to tell `app!` from a local called `app`.
    const position = {
      attribute,
      attributeName: match.index === attributeNameAt,
      macroCall: text[match.index + match[0].length] === "!",
    };
    const at = offset + match.index;
    const resolved =
      expressions.members.get(at) ??
      resolveToken(match[0], scope, expressions.index, position);
    const variable = resolved ? undefined : expressions.variables.get(at);

    // A name the example declared is rendered as a local, never as a framework symbol — it has no
    // page and claiming otherwise would promise one. The declaration is looked up among *this*
    // block's own, which is what supplies a line to jump to; a name inherited from a sibling block
    // of the same `<Example>` resolves without one.
    // Framework symbol, then local declaration, then typed local, and only then somebody else's
    // type. The order is the order of confidence: the framework is what this site documents, and
    // an external name must never shadow one of its own.
    // A name at its own declaration is that declaration, whatever else it might resolve to.
    const declared = expressions.declarationSites.get(at);
    const externalMember =
      resolved || variable ? undefined : expressions.externalMembers.get(at);
    const external =
      resolved || variable || externalMember
        ? undefined
        : externalFor(match[0], text, match.index, scope, expressions.index);

    const element = declared
      ? localElement(match[0], declaredSymbol(declared), declared, block)
      : resolved
        ? isLocal(resolved.symbol)
          ? localElement(
              match[0],
              resolved.symbol,
              expressions.annotations.get(resolved.path),
              block,
            )
          : symbolElement(match[0], resolved, context)
        : variable
          ? variableElement(match[0], variable, context)
          : externalMember
            ? externalMemberElement(match[0], externalMember)
            : external && externalElement(match[0], external);

    if (!element) {
      continue;
    }

    if (match.index > consumed) {
      parts.push({ type: "text", value: text.slice(consumed, match.index) });
    }

    parts.push(element);
    consumed = match.index + match[0].length;
  }

  if (parts.length === 0) {
    return null;
  }

  if (consumed < text.length) {
    parts.push({ type: "text", value: text.slice(consumed) });
  }

  return parts;
}

/**
 * Marks a name the snippet declared for itself.
 *
 * A third category alongside framework symbols and typed locals, and it needs to be: `Greeter` is
 * neither something the reader can look up in the framework nor a value — it is a type this example
 * invented. Rendering it as a framework symbol would promise a page that cannot exist.
 *
 * What it gets instead is the thing that is actually useful: the line it was declared on, so a use
 * of it can jump back to its definition without leaving the page.
 */
function localElement(
  text: string,
  symbol: Symbol,
  declaration: Declaration | undefined,
  block: string,
): TokenChild {
  const properties: Record<string, string> = {
    class: "local",
    "data-local": symbol.name,
    "data-local-kind": symbol.kind,
    "data-lens": semanticKind(symbol.kind),
  };

  // A declaration carries its own block when it was inherited from a sibling of the same
  // `<Example>`; otherwise it belongs to this one. Either way the jump target is a line id that
  // exists somewhere on the page, which is what makes the destination reachable at all.
  if (declaration) {
    properties["data-local-line"] = String(declaration.line);
    properties["data-local-block"] = declaration.block ?? block;
  }

  assign(properties, "data-local-signature", symbol.signature);
  assign(properties, "data-local-doc", symbol.doc);

  return {
    type: "element",
    tagName: "span",
    properties,
    children: [{ type: "text", value: text }],
  };
}

function symbolElement(
  text: string,
  resolved: ResolvedToken,
  context: RenderContext,
): TokenChild {
  const { symbol } = resolved;
  const documented = context.docsHref?.(resolved.path);
  const properties: Record<string, string> = {
    class: "symbol",
    "data-symbol": resolved.path,
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

  // A documented symbol becomes a real link, which also makes it keyboard reachable, so its card is
  // available to more than a mouse. An undocumented one stays a span: there is nowhere to go, and a
  // link to a page that does not exist would be worse than no link. Anchors are valid in `pre`.
  if (documented) {
    properties.href = documented.href;
    properties["data-symbol-docs-title"] = documented.title;
  }

  return {
    type: "element",
    tagName: documented ? "a" : "span",
    properties,
    children: [{ type: "text", value: text }],
  };
}

/**
 * Marks a local whose type the build worked out.
 *
 * A different element and a different attribute namespace from a symbol, because it is a different
 * claim. A symbol reference says "this is `App`"; this says "this local holds an `App`" — and the
 * reader has to be able to tell those apart at a glance, or the annotation is worse than nothing.
 * It is never a link: there is nowhere to send someone for a variable, and the type it points at is
 * one click away on the card.
 *
 * This is the part of the code lens that most helps a reader who is not already fluent in the
 * framework: a snippet is full of short local names, and knowing what each one *is* without holding
 * the whole chain in your head is most of what reading unfamiliar code costs.
 */
function variableElement(
  text: string,
  variable: ResolvedVariable,
  context: RenderContext,
): TokenChild {
  // A local holding a framework type links to that type's page when there is one; a local holding
  // another crate's type links to that crate's documentation. Both are the same statement — "here
  // is what this value is" — pointed at whichever tier could answer.
  const documented = variable.symbol
    ? context.docsHref?.(variable.path)
    : undefined;
  const properties: Record<string, string> = {
    class: "variable",
    "data-variable": text,
    "data-variable-type": variable.external?.path ?? variable.path,
    "data-variable-kind": variable.kind,
    // A local is coloured as a local whatever it holds: what the reader is being told is that this
    // name is a value, and the type it has is on the card.
    "data-lens": "local",
  };

  assign(properties, "data-variable-doc", variable.doc);
  assign(
    properties,
    "data-variable-href",
    documented?.href ?? variable.external?.docsUrl,
  );
  assign(properties, "data-variable-crate", variable.external?.crate);

  return {
    type: "element",
    tagName: "span",
    properties,
    children: [{ type: "text", value: text }],
  };
}

/**
 * Whether a token names an external symbol worth marking.
 *
 * Held to a stricter standard than a framework name, because the external table is enormous — 5,132
 * symbols across 390 crates — and most of it is transitive machinery a documentation snippet never
 * mentions. A lowercase token is skipped entirely: `map`, `get` and `new` are function names in
 * somebody's crate and also the most common words in any snippet. Only a type-like name, or one in
 * a `use` statement, is considered.
 */
function externalFor(
  token: string,
  text: string,
  at: number,
  scope: SnippetScope,
  index: ResolverIndex,
) {
  // A path segment before `::` is a module qualifier, and the segment after it is the real subject.
  if (text.slice(at + token.length).startsWith("::")) {
    return undefined;
  }

  // What the snippet imported settles it, whatever the name looks like — a file cannot import two
  // types of the same name and still compile, so its imports are an answer rather than a hint.
  const imported = externalFromScope(token, scope, index);

  if (imported) {
    return imported;
  }

  const typeLike = token[0] === token[0].toUpperCase();

  if (!typeLike || NEVER_RESOLVE_EXTERNAL.has(token)) {
    return undefined;
  }

  return findExternal(token, index);
}

/**
 * External names too common to mark.
 *
 * Single letters are generic parameters. `Self` is syntax. The rest are so ubiquitous that marking
 * every occurrence would make a snippet a wall of underlines while telling a Rust reader nothing
 * they do not already know.
 */
const NEVER_RESOLVE_EXTERNAL = new Set([
  "Self",
  "Ok",
  "Err",
  "Some",
  "None",
  "String",
  "Vec",
  "Option",
  "Result",
  "Box",
]);

/**
 * Marks a type the framework refers to but does not define.
 *
 * A fourth token class, and it earns being one: `Arc` is neither part of this framework nor
 * something the example declared, so it links away from the site rather than into it. The kind
 * travels with it, which is what lets a reader tell `Serialize` (a trait) from `Duration` (a type)
 * without knowing either.
 */
function externalElement(text: string, symbol: ExternalSymbol): TokenChild {
  const properties: Record<string, string> = {
    class: "external",
    "data-external": symbol.path,
    "data-external-kind": symbol.kind,
    "data-external-crate": symbol.crate,
    "data-lens": semanticKind(symbol.kind),
  };

  // Present only for the standard library, and only when the toolchain has `rust-docs-json`. The
  // card shows what there is and says nothing where there is nothing.
  assign(properties, "data-external-doc", symbol.doc);
  assign(properties, "data-external-signature", symbol.signature);

  if (symbol.docsUrl) {
    properties.href = symbol.docsUrl;
    properties.rel = "noreferrer";
  }

  return {
    type: "element",
    tagName: symbol.docsUrl ? "a" : "span",
    properties,
    children: [{ type: "text", value: text }],
  };
}

/**
 * Marks a method or associated item on a type another crate defines.
 *
 * `message.len()` where `message` is a `String`. Rendered as an external token rather than a symbol,
 * because that is what it is — the destination is the standard library's documentation, not a page
 * on this site.
 */
function externalMemberElement(
  text: string,
  resolved: ResolvedExternalMember,
): TokenChild {
  const { owner, member } = resolved;
  const properties: Record<string, string> = {
    class: "external",
    "data-external": `${owner.path}::${member.name}`,
    "data-external-kind": member.kind,
    "data-external-crate": owner.crate,
    "data-lens": semanticKind(member.kind),
  };

  assign(properties, "data-external-doc", member.doc);
  assign(properties, "data-external-signature", member.signature);

  if (owner.docsUrl) {
    properties.href = owner.docsUrl;
    properties.rel = "noreferrer";
  }

  return {
    type: "element",
    tagName: owner.docsUrl ? "a" : "span",
    properties,
    children: [{ type: "text", value: text }],
  };
}

/**
 * The colour group a symbol kind belongs to.
 *
 * Every annotated token already carries its exact kind, but styling on those directly would mean a
 * rule per kind across four attribute namespaces. A single shared attribute holding the *group* is
 * what the stylesheet keys on, and grouping is the point anyway: a reader distinguishing a call from
 * a type does not need `assoc_fn` told apart from `method`.
 *
 * Emitted as `data-lens` rather than `data-kind`, which a code block's caption and a callout already
 * use for unrelated things.
 *
 * Kept deliberately few. The goal is to make a dense snippet readable at a glance, and a palette
 * with a colour per kind is a worse answer than no colour at all.
 */
export function semanticKind(kind: string): string {
  if (kind === "method" || kind === "assoc_fn" || kind === "function") {
    return "callable";
  }

  if (kind === "macro" || kind === "proc_macro") {
    return "macro";
  }

  if (kind === "variant" || kind === "constant" || kind === "assoc_const") {
    return "value";
  }

  if (kind === "struct_field") {
    return "field";
  }

  if (kind === "module") {
    return "module";
  }

  // struct, enum, trait, type_alias, union, primitive, assoc_type — the nouns.
  return "type";
}

/** A declaration shaped as the symbol its own site refers to. */
function declaredSymbol(declaration: Declaration): Symbol {
  return {
    path: declaration.owner
      ? `${declaration.owner}::${declaration.name}`
      : declaration.name,
    name: declaration.name,
    kind: declaration.kind,
    crate: "",
    signature: declaration.signature,
    doc: declaration.doc,
    source: null,
    deprecation: null,
    feature: null,
    returns: declaration.returns,
    implementations: [],
    implementors: [],
    derefTarget: null,
    aliasOf: null,
  };
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
