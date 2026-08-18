/**
 * The symbol record: what the index stores about one framework item, and how its fields are derived.
 *
 * Separated from the index builder so that the record and the two collectors that produce it —
 * `symbols.ts` for module-level items, `members.ts` for everything reached through an impl — can all
 * refer to it without importing each other.
 */

import type { RustdocDeprecation } from "./types.ts";

/**
 * Item kinds the index carries. Anything else in rustdoc's output is structural and skipped.
 *
 * `method` and `assoc_fn` are both functions to rustdoc. They are split here because the difference
 * is the only thing that makes a member resolvable from a snippet: a `method` is reached through a
 * value (`app.serve()`), an `assoc_fn` through the type (`App::builder()`), and confusing the two
 * produces a link to something the reader did not write.
 */
export const SYMBOL_KINDS = [
  "module",
  "struct",
  "enum",
  "trait",
  "function",
  "method",
  "assoc_fn",
  "type_alias",
  "constant",
  "macro",
  "proc_macro",
  "assoc_type",
  "assoc_const",
  "variant",
  "struct_field",
] as const;

export type SymbolKind = (typeof SYMBOL_KINDS)[number];

/** Kinds that belong to a type or trait rather than to a module. */
export const MEMBER_SYMBOL_KINDS: ReadonlySet<SymbolKind> = new Set<SymbolKind>(
  [
    "method",
    "assoc_fn",
    "assoc_type",
    "assoc_const",
    "variant",
    "struct_field",
  ],
);

export interface SymbolSource {
  /** Path relative to the owning crate's repository root. */
  readonly file: string;
  readonly line: number;
}

export type SymbolDeprecation = RustdocDeprecation;

export interface ProcMacro {
  readonly kind: "bang" | "attribute" | "derive";
  readonly helpers: readonly string[];
}

/**
 * One public Rust symbol used by inline enrichment and optional generated reference pages.
 *
 * Deliberately not a general-purpose API model. The site does not generate API reference pages, so
 * The plain `doc` summary remains intentionally small for browser payloads. `docs` retains Rustdoc's
 * original Markdown for server-side rendering of one requested generated page.
 */
export interface Symbol {
  /** Defining path, and the symbol's identity, e.g. `framework_core::scope::Singleton`. */
  readonly path: string;
  /** Last path segment. */
  readonly name: string;
  readonly kind: SymbolKind;
  /** Explicit procedural-macro metadata from rustdoc. Null for every other item and old artifacts. */
  readonly procMacro: ProcMacro | null;
  /** Owning crate, using the Cargo name (`framework-core`), not the module name. */
  readonly crate: string;
  readonly signature: string | null;
  /**
   * Summary line, taken from the first paragraph of the `///` comment.
   *
   * Rust convention puts the summary there, so this is a real summary rather than a truncation.
   * The full body would only be useful on a generated reference page, which this site does not have.
   */
  readonly doc: string | null;
  /** Full Rustdoc Markdown, byte-for-byte as emitted by rustdoc. */
  readonly docs: string | null;
  readonly source: SymbolSource | null;
  readonly deprecation: SymbolDeprecation | null;
  /** Cargo feature of the facade crate that must be enabled to reach this symbol. */
  readonly feature: string | null;
  /**
   * For a function member, its return type as rendered — `AppBuilder<D>`, `Result<(), Error>`, `Self`.
   *
   * Carried as its own field rather than parsed back out of `signature` when it is needed. It is
   * what lets a builder chain in a snippet resolve past its first call: knowing that `App::builder`
   * returns an `AppBuilder` is the only way `.name()` after it can mean anything. Recovering that
   * by re-parsing a string built for display would rot the first time the display changes.
   */
  readonly returns: string | null;
  /**
   * Traits this type implements, by bare name.
   *
   * Metadata on the type rather than symbols of their own: an impl is not something a reader looks
   * up by name, and listing each one separately fills search with entries whose meaning is unclear.
   * A symbol page can render these; nothing else has to know they exist.
   *
   * Names rather than paths because this is display: `Send` is what a reader recognises, and
   * `core::marker::Send` is the same fact spelled less usefully.
   */
  readonly implementations: readonly string[];
  /**
   * For a trait, the canonical paths of the types that implement it.
   *
   * The more useful direction for a trait, and the one rustdoc's own output makes hardest to get
   * at: a type lists its traits locally, but a trait's implementors are scattered across every
   * crate that wrote one. Paths rather than names because a reader following an implementor wants
   * to reach it, and a bare name is not enough to look one up.
   */
  readonly implementors: readonly string[];
  /**
   * What it dereferences to, from its `Deref` impl.
   *
   * The one trait impl the index reads the *body* of, because Rust's own method lookup reads it:
   * a method called on a wrapper is usually a method on what it wraps. Without it every newtype in
   * the framework is a dead end one call in.
   */
  readonly derefTarget: string | null;
  /**
   * For a type alias, what it is an alias *of*.
   *
   * An alias has no members of its own — `AtomicU64` is `Atomic<u64>`, and `fetch_add` belongs to
   * `Atomic`. Rust treats the two as the same type, so resolution has to as well, or every alias in
   * the standard library and the framework is a dead end.
   */
  readonly aliasOf: string | null;
}

/** Longest summary a hover card shows before it stops being a summary. */
const MAX_SUMMARY = 320;

/**
 * First paragraph of a doc comment, as plain text.
 *
 * Kept separately from the full Markdown body so metadata and browser annotations remain compact.
 */
export function summarise(docs: string | null): string | null {
  if (!docs) {
    return null;
  }

  const paragraph = stripInlineMarkdown(docs.split("\n\n")[0])
    .replace(/\s+/g, " ")
    .trim();

  if (paragraph === "") {
    return null;
  }

  return paragraph.length > MAX_SUMMARY
    ? `${paragraph.slice(0, MAX_SUMMARY - 1)}…`
    : paragraph;
}

/**
 * Removes the inline markers a doc summary is written with.
 *
 * The hover card renders text, not markdown, so `**emphasis**` would otherwise be shown literally.
 * This handles the four forms that actually appear in summary lines — emphasis, inline code, links
 * and intra-doc link brackets — and deliberately nothing else. It is display normalisation, not a
 * markdown implementation: block structure never reaches here, because only the first paragraph
 * does. Rendering summaries as real markdown would mean a markdown dependency for one line of text.
 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[`?([^\]`]+)`?\]/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}
