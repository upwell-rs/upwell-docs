/**
 * Resolves identifiers in an authored code snippet to framework symbols.
 *
 * This is the "what does this token mean?" half of code rendering; Shiki answers "how should this
 * token look?". The two are kept apart deliberately: nothing here inspects a grammar scope, and
 * nothing in the highlighter knows what a symbol is.
 *
 * Resolution is lexical, not semantic. It reads the snippet's own `use` statements and matches bare
 * identifiers against the index. That is enough for documentation snippets, which are short and
 * import what they use, and it needs no Rust compiler at build time. It will not resolve a type
 * that is only inferred — which is why an unresolved token renders as ordinary code rather than as
 * a broken link.
 */

import { PRIMITIVES, STANDARD_LIBRARY } from "../rustdoc/externals.ts";
import type { ExternalSymbol, Symbol } from "../rustdoc/symbols.ts";

/** Just enough of the symbol index to resolve against. */
export interface ResolverIndex {
  /** Every reachable path — canonical and re-exported — mapped to the canonical path. */
  readonly paths: Readonly<Record<string, string>>;
  /** Bare name mapped to the canonical paths that share it. */
  readonly names: Readonly<Record<string, readonly string[]>>;
  readonly symbols: ReadonlyMap<string, Symbol>;
  /**
   * The reduced tier: symbols the framework refers to but does not define.
   *
   * Consulted only after the framework itself has been asked, so a name the framework defines is
   * never shadowed by somebody else's. Optional so a build without an artifact — or with one that
   * predates the tier — behaves exactly as it did before.
   */
  readonly externals?: ExternalLookup;
}

/** How an external symbol is looked up: by path, or by the bare name a snippet writes. */
export interface ExternalLookup {
  readonly byPath: ReadonlyMap<string, ExternalSymbol>;
  readonly byName: Readonly<Record<string, readonly string[]>>;
  /** Crates the workspace depends on directly, as module names. */
  readonly direct: ReadonlySet<string>;
  /**
   * Framework paths that re-export another crate's item, mapped to that item.
   *
   * `upwell::axum::prelude::Path` -> `axum::extract::path::Path`. This is what makes a snippet's
   * imports decisive rather than merely suggestive.
   */
  readonly aliases: Readonly<Record<string, string>>;
}

/**
 * The external symbol a snippet's own imports say a name refers to.
 *
 * **The snippet is the authority, and it can be trusted completely.** A file that imported both
 * `std::path::Path` and axum's `Path` would not compile, so whichever one it imported is the one it
 * means — there is no ambiguity left to resolve heuristically. That applies to a glob import too:
 * `use upwell::axum::prelude::*` brings axum's `Path` into scope because the prelude re-exports it,
 * and the alias table records exactly that.
 *
 * Checked before any framework-wide guess, and it is the difference between marking `Path` correctly
 * in an HTTP handler and refusing to mark it at all.
 */
export function externalFromScope(
  token: string,
  scope: SnippetScope,
  index: ResolverIndex,
): ExternalSymbol | undefined {
  const external = index.externals;

  if (!external) {
    return undefined;
  }

  // An explicit `use std::path::Path` names the item outright — either as a path the framework
  // re-exports, or as the external item's own path.
  const imported = scope.imports.get(token);

  if (imported) {
    return (
      external.byPath.get(external.aliases[imported] ?? imported) ??
      nearestTo(imported, token, index)
    );
  }

  for (const glob of scope.globs) {
    const target = external.aliases[`${glob}::${token}`];

    if (target) {
      return external.byPath.get(target);
    }
  }

  return undefined;
}

/**
 * Finds the external symbol a bare name refers to, if exactly one does.
 *
 * Ambiguity resolves to nothing for the same reason it does for framework symbols: two crates in the
 * tree both defining `Error` says nothing about which one a snippet means, and a card naming the
 * wrong crate is worse than an unmarked token. The standard library is the one exception, and it
 * has to be — see below.
 */
/**
 * The external symbol an import most likely names, when its exact path is not in the table.
 *
 * A snippet writes `use std::sync::atomic::Ordering`; rustdoc records the item at
 * `core::sync::atomic::Ordering`, because `std` re-exports it and rustdoc keys everything by where
 * it is defined. The two paths are the same item and differ only in their first segment, which is a
 * pattern the standard library follows throughout.
 *
 * Matching on the longest shared tail is what separates that from a genuine mismatch: against
 * `core::cmp::Ordering` the atomic import shares three trailing segments and the comparison one
 * shares a single name, so the import decides which `Ordering` is meant — which is the whole point
 * of consulting it.
 */
function nearestTo(
  imported: string,
  name: string,
  index: ResolverIndex,
): ExternalSymbol | undefined {
  const wanted = imported.split("::");
  let best: { symbol: ExternalSymbol; shared: number } | undefined;

  for (const path of index.externals?.byName[name] ?? []) {
    const symbol = index.externals?.byPath.get(path);

    if (!symbol) {
      continue;
    }

    const candidate = symbol.path.split("::");
    let shared = 0;

    while (
      shared < candidate.length &&
      shared < wanted.length &&
      candidate[candidate.length - 1 - shared] ===
        wanted[wanted.length - 1 - shared]
    ) {
      shared += 1;
    }

    if (shared > 1 && (!best || shared > best.shared)) {
      best = { symbol, shared };
    }
  }

  return best?.symbol;
}

/**
 * Kinds that can name a type.
 *
 * A variant is excluded even though it shares a name with plenty of types — `WsValue::String` is not
 * `String`, and counting it as a candidate is what made the most common type in Rust look ambiguous.
 */
const TYPE_KINDS = new Set([
  "struct",
  "enum",
  "trait",
  "type_alias",
  "union",
  "primitive",
]);

export function findExternal(
  name: string,
  index: ResolverIndex,
): ExternalSymbol | undefined {
  const candidates = index.externals?.byName[name] ?? [];

  if (candidates.length === 0) {
    return undefined;
  }

  const symbols = candidates
    .map((path) => index.externals?.byPath.get(path))
    .filter((symbol) => symbol !== undefined)
    .filter((symbol) => TYPE_KINDS.has(symbol.kind));

  // A primitive wins outright and without contest. `bool` is the language's `bool`, whatever a
  // dependency happens to alias under `__private`, and nothing a snippet does can change that.
  const primitive = PRIMITIVES.get(name);

  if (primitive && symbols.some((symbol) => symbol.path === primitive.path)) {
    return primitive;
  }

  /**
   * The standard library wins, but only against crates a snippet could not plausibly have meant.
   *
   * `Arc` is `alloc::sync::Arc` and also a type in `const_oid` and one in `heapless`, because a
   * 554-crate tree contains every name several times. Treating that as ambiguity loses the most
   * common type in the framework's signatures to two crates nobody has heard of.
   *
   * But `Path` is `std::path::Path` **and** `axum::extract::Path`, and axum is a declared dependency
   * — in an HTTP handler the second is what is meant. Preferring the standard library there produces
   * a confidently wrong answer, which is the one outcome worth avoiding. So the preference applies
   * only when every competitor is a transitive crate the documentation would never name.
   */
  const standard = symbols.filter((symbol) =>
    STANDARD_LIBRARY.has(symbol.crate),
  );
  const contested = symbols.some(
    (symbol) =>
      !STANDARD_LIBRARY.has(symbol.crate) &&
      index.externals!.direct.has(symbol.crate),
  );

  const preferred = standard.length > 0 && !contested ? standard : symbols;
  const crates = new Set(preferred.map((symbol) => symbol.crate));

  // Still more than one crate after the preference: genuine ambiguity, and a card naming the wrong
  // crate is worse than an unmarked token.
  if (crates.size !== 1) {
    return undefined;
  }

  // Within one crate the candidates are the same item re-exported. The shortest path is the one a
  // reader recognises.
  return preferred.reduce((best, symbol) =>
    symbol.path.length < best.path.length ? symbol : best,
  );
}

/** What a snippet's `use` statements bring into scope. */
export interface SnippetScope {
  /** Identifier mapped to the full path it was imported as. */
  readonly imports: ReadonlyMap<string, string>;
  /** Module paths brought in by a glob import, in the order they were written. */
  readonly globs: readonly string[];
}

const USE_LINE = /^\s*use\s+([^;]+);/gm;

/**
 * Reads the `use` statements of a snippet.
 *
 * Brace groups are expanded (`use upwell::{a, b::C}`), globs are recorded as module prefixes, and
 * `as` renames bind the local name. Anything else is ignored rather than guessed at.
 */
export function readScope(code: string): SnippetScope {
  const imports = new Map<string, string>();
  const globs: string[] = [];

  for (const match of code.matchAll(USE_LINE)) {
    for (const path of expandUse(match[1].trim())) {
      if (path.endsWith("::*")) {
        globs.push(path.slice(0, -3));

        continue;
      }

      const [target, alias] = path.split(/\s+as\s+/);
      const name = (alias ?? target.split("::").pop() ?? "").trim();

      if (name !== "" && name !== "_") {
        imports.set(name, target.trim());
      }
    }
  }

  return { imports, globs };
}

/** Expands one `use` body into flat paths, handling a single level of brace nesting. */
function expandUse(body: string): string[] {
  const open = body.indexOf("{");

  if (open === -1) {
    return [body];
  }

  const close = body.lastIndexOf("}");

  if (close < open) {
    return [body];
  }

  const prefix = body.slice(0, open);
  const inner = body.slice(open + 1, close);

  return splitTopLevel(inner).flatMap((part) => {
    const trimmed = part.trim();

    if (trimmed === "") {
      return [];
    }

    if (trimmed === "self") {
      return [prefix.replace(/::$/, "")];
    }

    return expandUse(`${prefix}${trimmed}`);
  });
}

/** Splits on commas that are not inside a nested brace group. */
function splitTopLevel(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const character of inner) {
    if (character === "{") {
      depth += 1;
    }

    if (character === "}") {
      depth -= 1;
    }

    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";

      continue;
    }

    current += character;
  }

  parts.push(current);

  return parts;
}

/** Identifiers that are Rust syntax or ubiquitous prelude items, never worth linking. */
const NEVER_RESOLVE = new Set([
  "as",
  "async",
  "await",
  "break",
  "const",
  "continue",
  "crate",
  "dyn",
  "else",
  "enum",
  "extern",
  "false",
  "fn",
  "for",
  "if",
  "impl",
  "in",
  "let",
  "loop",
  "match",
  "mod",
  "move",
  "mut",
  "pub",
  "ref",
  "return",
  "self",
  "Self",
  "static",
  "struct",
  "super",
  "trait",
  "true",
  "type",
  "unsafe",
  "use",
  "where",
  "while",
  "Ok",
  "Err",
  "Some",
  "None",
  "Box",
  "Vec",
  "String",
  "str",
  "Option",
  "Result",
  "bool",
  "u8",
  "u16",
  "u32",
  "u64",
  "usize",
  "i8",
  "i16",
  "i32",
  "i64",
  "isize",
  "f32",
  "f64",
  "char",
]);

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Kinds a bare identifier can legitimately refer to.
 *
 * Enum variants, struct fields and associated items are excluded: they are only ever written
 * qualified, so matching one against a bare token means matching something else — a field named
 * `id`, a local named `Path` — to an unrelated definition.
 */
const LINKABLE_KINDS = new Set([
  "struct",
  "enum",
  "trait",
  "function",
  "macro",
  "proc_macro",
  "type_alias",
  "module",
  "constant",
]);

/** A token that resolved to a symbol, with how confident the resolution is. */
export interface ResolvedToken {
  readonly symbol: Symbol;
  /** The path the reader should see, which is the one that brought it into scope where possible. */
  readonly path: string;
  /**
   * `import` — named by a `use` in this snippet.
   * `glob` — reachable through a glob import in this snippet.
   * `unique` — not imported here, but the name is unambiguous across the whole framework.
   * `member` — reached through the type of the expression it was written on. See `expression.ts`.
   */
  readonly via: "import" | "glob" | "unique" | "member";
}

/** Where in the snippet an identifier appeared, which changes how much a match can be trusted. */
export interface TokenPosition {
  /** True when the identifier sits inside an attribute, e.g. `#[component(by_value)]`. */
  readonly attribute?: boolean;
  /**
   * True when the identifier *is* the attribute's name — the first one after `#[`.
   *
   * Distinct from `attribute`, because the two positions admit different things. An attribute's
   * name can only be a macro: `#[controller(path = "…")]` is `upwell_axum_macros::controller`, and
   * resolving it to the module of the same name — which the facade also re-exports — describes it
   * as something that cannot appear there. Its *arguments* are ordinary, and `#[component(scope =
   * HttpRequest)]` must still resolve `HttpRequest` as the type it is.
   */
  readonly attributeName?: boolean;
  /**
   * True when the identifier is immediately followed by `!`, so it is a macro invocation.
   *
   * This is the same kind of evidence attribute position gives: a lowercase token can normally be a
   * local and is therefore not resolved from a glob import, but `app!` cannot be — Rust has no
   * value syntax that puts a `!` there. The `!` says what the token is, so the caution that exists
   * for bare lowercase names does not apply.
   */
  readonly macroCall?: boolean;
}

/** Kinds a `name!` invocation can refer to. Nothing else is callable that way. */
const MACRO_KINDS = new Set(["macro", "proc_macro"]);

/**
 * Resolves one identifier against the snippet's scope and the index.
 *
 * Ambiguity is resolved in favour of what the snippet itself says: an explicit import beats a glob,
 * and a glob beats a framework-wide name match. A name that is still ambiguous resolves to nothing,
 * because a wrong hover card is worse than none.
 *
 * Lowercase names are held to a higher standard than type-like ones. `use upwell::prelude::*` makes
 * every prelude item reachable, including short function and macro names that collide with ordinary
 * locals — a snippet binding `let (message, count) = …` must not turn `message` into a link to a
 * macro it never called. A lowercase glob match is therefore accepted only where the snippet itself
 * rules a local out: in attribute position, and in a `name!` invocation.
 */
export function resolveToken(
  token: string,
  scope: SnippetScope,
  index: ResolverIndex,
  position: TokenPosition = {},
): ResolvedToken | undefined {
  if (!IDENTIFIER.test(token) || NEVER_RESOLVE.has(token)) {
    return undefined;
  }

  // A `name!` invocation and an attribute's name are both macros and nothing else, so a module or
  // struct of the same name is the wrong answer however it was reached.
  const onlyMacros =
    position.macroCall === true || position.attributeName === true;
  const admits = (symbol: Symbol) =>
    !onlyMacros || MACRO_KINDS.has(symbol.kind);
  const imported = scope.imports.get(token);

  if (imported) {
    const symbol = lookup(imported, index);

    if (symbol && admits(symbol)) {
      return { symbol, path: imported, via: "import" };
    }
  }

  const typeLike = token[0] === token[0].toUpperCase();

  if (typeLike || position.attribute || onlyMacros) {
    for (const glob of scope.globs) {
      const path = `${glob}::${token}`;
      const symbol = lookup(path, index);

      if (symbol && admits(symbol)) {
        return { symbol, path, via: "glob" };
      }
    }
  }

  // The framework-wide fallback is restricted to type-like names for the same reason: a bare
  // lowercase match in a snippet that never imported it is far more likely to be a local. A macro
  // invocation is exempt, but only against the macros — `app!` may not resolve to a module named
  // `app`, which is exactly the collision the framework has.
  const candidates = index.names[token] ?? [];
  const eligible = onlyMacros
    ? candidates.filter((path) =>
        MACRO_KINDS.has(index.symbols.get(path)?.kind ?? ""),
      )
    : candidates;

  if (eligible.length === 1 && (typeLike || onlyMacros)) {
    const symbol = index.symbols.get(eligible[0]);

    if (symbol && LINKABLE_KINDS.has(symbol.kind) && admits(symbol)) {
      return { symbol, path: eligible[0], via: "unique" };
    }
  }

  return undefined;
}

function lookup(path: string, index: ResolverIndex): Symbol | undefined {
  const canonical = index.paths[path];
  const symbol = canonical ? index.symbols.get(canonical) : undefined;

  return symbol && LINKABLE_KINDS.has(symbol.kind) ? symbol : undefined;
}
