/**
 * The symbols the framework mentions but does not define.
 *
 * `Arc`, `String`, `Router`, `Duration`, `Serialize` — half of any real signature is somebody else's
 * type, and until now every one of them rendered as inert text. The obvious fix is to index the
 * crates they come from, and it does not survive contact with the numbers: std, core and alloc alone
 * are ~16,000 public symbols against the framework's 3,233, and the workspace has 554 crates in its
 * dependency tree. Documenting that is neither possible nor useful — nobody reads a framework's
 * documentation to learn about `gimli`.
 *
 * What is possible is a **reduced tier**: for an external symbol, record only what the site can act
 * on — its path, its kind, the crate it belongs to, and where it is documented. No signature, no
 * doc text, no members, no source location. That is a fraction of the size and it is exactly the
 * part that pays for itself:
 *
 * - **kind** separates a trait from a type, which is what tells the resolver that `T: Serialize`
 *   bounds a parameter rather than naming a field, and lets rendering mark the two differently
 * - **path** gives the reader the fully qualified name they would have to look up anyway
 * - **crate and documentation root** turn the token into a link to the real documentation
 *
 * And none of it needs a second rustdoc run. rustdoc records external items in the same `paths` map
 * it records local ones, tagged with a `crate_id`, and `external_crates` maps that id to the crate's
 * name and its `html_root_url`. The framework's own output already contains the whole table.
 *
 * **It is never shipped to a browser.** Like the rest of the index it is consumed at build time,
 * where annotation happens; what reaches a reader is the finished markup.
 */

import type { RustdocCrate } from "./types.ts";

/** An external symbol, reduced to what the site can act on. */
export interface ExternalSymbol {
  /** Fully qualified path as the defining crate writes it, e.g. `std::sync::Arc`. */
  readonly path: string;
  /** Last segment. */
  readonly name: string;
  /** rustdoc's kind. Kept as written rather than mapped, since nothing here consumes it as a union. */
  readonly kind: string;
  /** Defining crate's module name, e.g. `std`, `tokio`. */
  readonly crate: string;
  /** Where its documentation lives, when the crate declares a root. */
  readonly docsUrl: string | null;
  /**
   * First paragraph of its documentation.
   *
   * Only present for the standard library, and only when `rust-docs-json` is installed — see
   * `standard-library.ts`. Everything else in this tier is derivable from the framework's own
   * rustdoc output; this is not.
   */
  readonly doc?: string | null;
  /** Its signature, on the same terms as `doc`. */
  readonly signature?: string | null;
  /**
   * Its inherent members, so `message.len()` can resolve.
   *
   * Inherent only. A trait impl would contribute `String::clone` and say nothing, and every type in
   * the standard library implements a dozen traits.
   */
  readonly members?: readonly ExternalMember[];
  /**
   * What it dereferences to, from its `Deref` impl.
   *
   * The one trait impl worth reading, because Rust's own method resolution reads it: a method
   * called on an `Arc<AtomicU64>` is usually a method on `AtomicU64`, and a `String` is mostly
   * used through `str`. Without it every wrapper type is a dead end one call in.
   */
  readonly derefTarget?: string | null;
  /**
   * For a type alias, what it is an alias of — `AtomicU64` is `Atomic<u64>`.
   *
   * Aliases carry no members of their own, so without following them `self.counter.fetch_add(…)`
   * stops one step short of the type that actually has the method.
   */
  readonly aliasOf?: string | null;
}

/** One member of an external type, reduced the same way the type itself is. */
export interface ExternalMember {
  readonly name: string;
  readonly kind: string;
  readonly signature: string | null;
  readonly doc: string | null;
  /**
   * The type an access to it evaluates to.
   *
   * Carried for the same reason the framework's own members carry it: without it a chain stops at
   * the first external call, so `let shared = Arc::new(…)` binds nothing and everything written on
   * `shared` afterwards is unannotated.
   */
  readonly returns: string | null;
  /**
   * The impl subject this member came from, when the type has more than one.
   *
   * `Atomic<T>` has twelve inherent impls — one per integer width — and each defines `fetch_add`
   * with a different signature. Without knowing which impl a member belongs to, the first one wins
   * arbitrarily and `AtomicU64::fetch_add` is described as returning an `i8`.
   *
   * Absent for the ordinary case of a type with one impl, where it would be the type's own name
   * repeated on every member.
   */
  readonly subject?: string;
}

/** Bare name mapped to the external paths sharing it, for resolving a token that names one. */
export type ExternalNames = Readonly<Record<string, readonly string[]>>;

export interface ExternalIndex {
  readonly symbols: readonly ExternalSymbol[];
  readonly names: ExternalNames;
  /**
   * Crates the workspace depends on directly, as module names.
   *
   * Recorded so resolution can tell a plausible competitor from an implausible one. A name shared
   * with the standard library resolves to the standard library only when nothing a snippet could
   * realistically have imported also defines it.
   */
  readonly direct: readonly string[];
  /**
   * Framework paths that re-export another crate's item, mapped to that item.
   *
   * `framework::http::prelude::Path` -> `axum::extract::Path`. This is what makes a snippet's own
   * imports decisive: `Path` is ambiguous across the dependency tree, but a snippet that globs the
   * axum prelude has said which one it means, and Rust would not compile if it had imported both.
   */
  readonly aliases: Readonly<Record<string, string>>;
}

/**
 * The crates of the standard library, which is where an ambiguous name almost always belongs.
 *
 * `Arc` is `alloc::sync::Arc`, and also `const_oid::arcs::Arc` and `heapless::…::Arc`, because a
 * dependency tree of 554 crates contains a lot of names. Without a preference the resolver sees
 * three candidates and gives up on the single most common type in the framework's signatures.
 */
export const STANDARD_LIBRARY: ReadonlySet<string> = new Set([
  "std",
  "core",
  "alloc",
  "proc_macro",
]);

/**
 * Rust's primitive types.
 *
 * Written out rather than derived, because they are a closed set fixed by the language: no release
 * adds one, and nothing in a dependency tree can change what `u64` means. Deriving them from rustdoc
 * actively produces the wrong answer — `paths` files `u64` under `std::u64`, which is the deprecated
 * *module* of constants, so a link built from it lands on the wrong page.
 *
 * They are recorded so a type lens can say `count: u64` and point at the primitive's own page. Bare
 * primitive tokens in code are still left alone; `NEVER_RESOLVE` sees to that, and underlining every
 * `u64` in a snippet would be noise rather than information.
 */
const PRIMITIVE_NAMES = [
  "bool",
  "char",
  "str",
  "f32",
  "f64",
  "i8",
  "i16",
  "i32",
  "i64",
  "i128",
  "isize",
  "u8",
  "u16",
  "u32",
  "u64",
  "u128",
  "usize",
  "unit",
  "never",
  "slice",
  "array",
  "tuple",
  "pointer",
  "reference",
  "fn",
] as const;

/** Where the standard library documents a primitive. A stable URL shape, unlike a module path. */
const PRIMITIVE_ROOT = "https://doc.rust-lang.org/stable/std/primitive.";

/** The primitive records, keyed by the name a snippet writes. */
export const PRIMITIVES: ReadonlyMap<string, ExternalSymbol> = new Map(
  PRIMITIVE_NAMES.map((name) => [
    name,
    {
      path: name,
      name,
      kind: "primitive",
      crate: "std",
      docsUrl: `${PRIMITIVE_ROOT}${name}.html`,
    },
  ]),
);

/**
 * Collects every external symbol a crate's rustdoc output refers to.
 *
 * Accumulated across crates, because the same type is referenced from many of them and the first
 * mention is as good as any: the record carries no per-reference information.
 */
export function collectExternals(
  doc: RustdocCrate,
  into: Map<string, ExternalSymbol>,
): void {
  for (const summary of Object.values(doc.paths)) {
    // `crate_id` 0 is the crate being read; anything else is somebody else's.
    if (summary.crate_id === 0) {
      continue;
    }

    const external = doc.external_crates[String(summary.crate_id)];
    const path = summary.path.join("::");

    if (!external || into.has(path) || summary.path.length === 0) {
      continue;
    }

    into.set(path, {
      path,
      name: summary.path[summary.path.length - 1],
      kind: summary.kind,
      crate: external.name,
      docsUrl: documentationUrl(
        summary.path,
        summary.kind,
        external.html_root_url,
      ),
    });
  }
}

/**
 * Where to send a reader looking for this item.
 *
 * **A search URL rather than a direct page link, and that is not laziness.** rustdoc records an
 * item's *defining* path, which is very often a private module: `HashMap` is
 * `std::collections::hash::map::HashMap`, and `hash::map` has no documentation page because it is
 * not public. Building `<root>/std/collections/hash/map/struct.HashMap.html` from it produces a URL
 * that 404s — the public page is at `std/collections/struct.HashMap.html`, and nothing in the
 * framework's own rustdoc output says so. Resolving that would mean indexing the dependency's
 * re-exports, which is exactly the thing this tier exists to avoid.
 *
 * A search URL is derivable from what is actually known, always resolves, and lands the reader on
 * the item. The precise path is still shown on the card, where being the defining path is correct.
 *
 * The standard library is searched through `std`, whatever crate an item is technically defined in:
 * `Arc` lives in `alloc` and every Rust programmer looks it up in `std`.
 */
export function documentationUrl(
  segments: readonly string[],
  kind: string,
  htmlRoot: string | undefined,
): string | null {
  if (segments.length === 0) {
    return null;
  }

  const name = segments[segments.length - 1];
  const crate = segments[0];

  if (STANDARD_LIBRARY.has(crate)) {
    const root = (htmlRoot ?? "https://doc.rust-lang.org/stable/").replace(
      /\/*$/,
      "/",
    );

    return `${root}std/index.html?search=${encodeURIComponent(name)}`;
  }

  // A crate that declares no `html_root_url` — most of them — is looked up on docs.rs at its
  // latest release, which is where a reader would go anyway.
  const root = (htmlRoot ?? `https://docs.rs/${crate}/latest/`).replace(
    /\/*$/,
    "/",
  );

  return `${root}${crate}/index.html?search=${encodeURIComponent(name)}`;
}

/** Freezes the collected symbols into the index the artifact carries. */
export function freezeExternals(
  collected: ReadonlyMap<string, ExternalSymbol>,
  direct: readonly string[] = [],
  aliases: ReadonlyMap<string, string> = new Map(),
): ExternalIndex {
  // Primitives replace whatever rustdoc recorded under the same name: `std::u64` is the module of
  // constants, not the type, and the hand-written record is the correct one.
  const merged = new Map(collected);

  for (const [name, primitive] of PRIMITIVES) {
    merged.delete(`std::${name}`);
    merged.delete(`core::${name}`);
    merged.set(primitive.path, primitive);
  }

  const symbols = [...merged.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  const names: Record<string, string[]> = {};

  for (const symbol of symbols) {
    (names[symbol.name] ??= []).push(symbol.path);
  }

  return {
    symbols,
    names,
    direct: [...direct].sort(),
    aliases: Object.fromEntries(
      [...aliases].sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}
