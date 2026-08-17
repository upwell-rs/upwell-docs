/**
 * The rustdoc-derived facts about the symbol a page documents.
 *
 * A symbol page is hand-written prose, but the mechanical parts — the signature, which crate it
 * comes from, which Cargo feature reaches it, where it is defined — are known to the build. Passing
 * them in means a page can show them without copying them into prose, where they would rot the next
 * time the framework changes.
 *
 * Delivered through context rather than as component props: mdsvex owns a page's prop surface, and
 * context lets both the ready-made components and an author's own `<script>` block reach the same
 * data without every page having to declare and forward it.
 */

import { getSymbolInfo as getUiSymbolInfo, setSymbolInfo as setUiSymbolInfo } from "@upwell/docs-ui/context";

import type { SymbolKind } from "@upwell/docs-tools/rustdoc/symbols";

/** What the build knows about the documented symbol. */
export interface SymbolInfo {
  /** The path the page is addressed by, e.g. `framework::prelude::component`. */
  readonly path: string;
  /** Where the symbol is defined, which may differ from `path` when it is a re-export. */
  readonly canonicalPath: string;
  readonly name: string;
  readonly kind: SymbolKind;
  /** Cargo package the symbol is defined in, e.g. `framework-macros`. */
  readonly crate: string;
  readonly signature: string | null;
  /** First paragraph of the symbol's `///` comment, as plain text. */
  readonly doc: string | null;
  /** Cargo feature of the facade crate that must be enabled to reach it. */
  readonly feature: string | null;
  readonly deprecation: { since: string | null; note: string | null } | null;
  /** Repository URL of the definition, at the documented commit. */
  readonly sourceHref: string | null;
  /** Definition location, relative to the framework repository root. */
  readonly source: { file: string; line: number } | null;
  /**
   * Traits this type implements.
   *
   * Metadata rather than symbols of their own: an impl is not something a reader looks up by name,
   * so it belongs on the type's page instead of in search results.
   */
  readonly implementations: readonly string[];
  /**
   * For a trait, the types implementing it — the direction a reader of a trait actually wants.
   *
   * Each carries the path a reader would write and whether the site documents it, resolved on the
   * server: the page cannot look either up, because the symbol index never reaches the browser.
   */
  readonly implementors: readonly SymbolLink[];
  /**
   * Members declared on this symbol: methods, associated functions, constants and types.
   *
   * Grouped and ordered on the server so the page renders a list rather than deriving one.
   */
  readonly members: readonly SymbolMember[];
}

/** A symbol referred to from another symbol's page. */
export interface SymbolLink {
  /** The path a reader would write, preferring a facade re-export. */
  readonly path: string;
  /** Final segment, for display. */
  readonly name: string;
  /** Where the site documents it, when it has a page. */
  readonly href: string | null;
}

/** One member of the documented symbol. */
export interface SymbolMember {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly signature: string | null;
  /** First paragraph of its `///` comment. */
  readonly doc: string | null;
  readonly deprecated: boolean;
  /** Repository URL of its definition. */
  readonly sourceHref: string | null;
}

export function setSymbolInfo(symbol: () => SymbolInfo): void {
  setUiSymbolInfo(symbol);
}

/**
 * The symbol the surrounding page documents.
 *
 * Throws outside a symbol page rather than returning undefined: every use is inside a page that has
 * one, so an absent value means the component was placed somewhere it cannot work, and saying so is
 * more useful than rendering nothing.
 */
export function getSymbolInfo(): SymbolInfo {
	return getUiSymbolInfo() as SymbolInfo;
}
