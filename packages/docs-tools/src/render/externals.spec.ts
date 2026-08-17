import { describe, expect, it } from "vitest";

import { testIndex } from "../fixtures.ts";
import type { ExternalSymbol } from "../rustdoc/symbols.ts";
import { resolveExpressions } from "./expression.ts";
import {
  type ExternalLookup,
  externalFromScope,
  findExternal,
  readScope,
  type ResolverIndex,
} from "./resolve.ts";

function external(
  path: string,
  kind: string,
  crate = path.split("::")[0],
): ExternalSymbol {
  return { path, name: path.split("::").pop()!, kind, crate, docsUrl: null };
}

/**
 * An index with an external tier, built the way the render context builds one.
 *
 * `direct` matters as much as the symbols: it is what separates a competitor a snippet could
 * plausibly have meant from one buried in the dependency tree.
 */
function withExternals(
  symbols: readonly ExternalSymbol[],
  direct: readonly string[] = [],
  aliases: Record<string, string> = {},
): ResolverIndex {
  const byName: Record<string, string[]> = {};

  for (const symbol of symbols) {
    (byName[symbol.name] ??= []).push(symbol.path);
  }

  const externals: ExternalLookup = {
    byPath: new Map(symbols.map((symbol) => [symbol.path, symbol])),
    byName,
    direct: new Set(direct),
    aliases,
  };

  return { ...testIndex([]), externals };
}

describe("findExternal", () => {
  it("resolves a name only one crate defines", () => {
    const index = withExternals([
      external("tokio::task::JoinHandle", "struct"),
    ]);

    expect(findExternal("JoinHandle", index)).toMatchObject({
      crate: "tokio",
      kind: "struct",
    });
  });

  it("carries the kind, which is what separates a trait from a type", () => {
    const index = withExternals([external("serde::ser::Serialize", "trait")]);

    expect(findExternal("Serialize", index)?.kind).toBe("trait");
  });

  it("prefers the standard library over crates buried in the dependency tree", () => {
    // `Arc` is defined by three crates in a 554-crate tree. Two of them are transitive and nobody
    // writing framework documentation means them.
    const index = withExternals(
      [
        external("alloc::sync::Arc", "struct"),
        external("const_oid::arcs::Arc", "struct"),
        external("heapless::pool::arc::Arc", "struct"),
      ],
      ["tokio", "axum"],
    );

    expect(findExternal("Arc", index)?.crate).toBe("alloc");
  });

  it("refuses when a direct dependency contests the standard library", () => {
    // `Path` is `std::path::Path` and `axum::extract::Path`, and in an HTTP handler it is the
    // second. Preferring std here would be confidently wrong, which is worse than unmarked.
    const index = withExternals(
      [
        external("std::path::Path", "struct"),
        external("axum::extract::Path", "struct"),
      ],
      ["axum"],
    );

    expect(findExternal("Path", index)).toBeUndefined();
  });

  it("refuses when two non-standard crates share a name", () => {
    const index = withExternals(
      [
        external("serde_core::ser::Serialize", "trait"),
        external("erased_serde::ser::Serialize", "trait"),
      ],
      ["serde"],
    );

    expect(findExternal("Serialize", index)).toBeUndefined();
  });

  it("takes the shortest path when one crate re-exports its own item", () => {
    const index = withExternals([
      external("tokio::sync::Sender", "struct"),
      external("tokio::sync::mpsc::inner::Sender", "struct"),
    ]);

    expect(findExternal("Sender", index)?.path).toBe("tokio::sync::Sender");
  });

  it("resolves nothing for a name no crate defines", () => {
    expect(findExternal("Nonexistent", withExternals([]))).toBeUndefined();
  });

  it("lets a primitive win outright, whatever a dependency aliases under the same name", () => {
    // `syn::__private::bool` is a real type alias in a real dependency. It is not `bool`.
    const index = withExternals(
      [
        external("bool", "primitive", "std"),
        external("syn::__private::bool", "type_alias"),
      ],
      ["syn"],
    );

    expect(findExternal("bool", index)).toMatchObject({
      kind: "primitive",
      crate: "std",
    });
  });

  it("ignores a variant that shares a name with a type", () => {
    // `WsValue::String` is a variant, not `String`, and counting it made the most common type in
    // Rust look ambiguous across three crates.
    const index = withExternals(
      [
        external("alloc::string::String", "struct"),
        external("json::WsValue::String", "variant"),
      ],
      ["json"],
    );

    expect(findExternal("String", index)?.path).toBe("alloc::string::String");
  });

  describe("a snippet's own imports", () => {
    const framework = withExternals(
      [
        external("std::path::Path", "struct"),
        external("axum::extract::path::Path", "struct"),
      ],
      ["axum"],
      { "upwell::axum::prelude::Path": "axum::extract::path::Path" },
    );

    it("resolves through a glob import of a module that re-exports the type", () => {
      // The framework's prelude re-exports axum's `Path`, so globbing it says which one is meant.
      expect(
        externalFromScope(
          "Path",
          readScope("use upwell::axum::prelude::*;"),
          framework,
        )?.crate,
      ).toBe("axum");
    });

    it("resolves through an explicit import naming the item outright", () => {
      expect(
        externalFromScope("Path", readScope("use std::path::Path;"), framework)
          ?.crate,
      ).toBe("std");
    });

    it("says nothing when the snippet imported neither", () => {
      expect(
        externalFromScope("Path", readScope(""), framework),
      ).toBeUndefined();
    });
  });

  describe("members of an external type", () => {
    const stdlib = withExternals([
      {
        ...external("alloc::string::String", "struct"),
        members: [
          {
            name: "len",
            kind: "method",
            signature: "pub fn len(&self) -> usize",
            doc: "Returns the length.",
            returns: "usize",
          },
          {
            name: "new",
            kind: "assoc_fn",
            signature: "pub fn new() -> String",
            doc: "Creates an empty String.",
            returns: "String",
          },
        ],
      },
    ]);

    it("resolves a method written on a value of that type", () => {
      const source = "fn run(message: String) { message.len(); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        stdlib,
      );

      expect(
        [...externalMembers.values()].map((entry) => entry.member.name),
      ).toEqual(["len"]);
    });

    it("carries the documentation the standard library wrote", () => {
      const source = "fn run(message: String) { message.len(); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        stdlib,
      );

      expect([...externalMembers.values()][0].member.doc).toBe(
        "Returns the length.",
      );
    });

    it("resolves an associated function written on the type", () => {
      const source = "fn run() { let s = String::new(); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        stdlib,
      );

      expect(
        [...externalMembers.values()].map((entry) => entry.member.name),
      ).toEqual(["new"]);
    });

    it("claims nothing for a name the type does not have", () => {
      const source = "fn run(message: String) { message.nonexistent(); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        stdlib,
      );

      expect(externalMembers.size).toBe(0);
    });

    it("claims nothing when the type carries no member list", () => {
      // A crate outside the standard library is never enriched, so it has no members to offer.
      const bare = withExternals([external("axum::routing::Router", "struct")]);
      const source = "fn run(router: Router) { router.route(); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        bare,
      );

      expect(externalMembers.size).toBe(0);
    });
  });

  describe("Deref", () => {
    /** A wrapper whose `Deref` target is a type parameter, as every standard-library wrapper's is. */
    const wrappers = withExternals([
      {
        ...external("alloc::sync::Arc", "struct"),
        derefTarget: "T",
        members: [],
      },
      {
        ...external("alloc::string::String", "struct"),
        derefTarget: "str",
        members: [
          {
            name: "capacity",
            kind: "method",
            signature: "pub fn capacity(&self) -> usize",
            doc: null,
            returns: "usize",
          },
        ],
      },
      {
        ...external("str", "primitive", "std"),
        members: [
          {
            name: "trim",
            kind: "method",
            signature: "pub fn trim(&self) -> &str",
            doc: null,
            returns: "&str",
          },
        ],
      },
    ]);

    it("follows a concrete target, so a String is usable as a str", () => {
      const source = "fn f(s: String) { s.trim(); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        wrappers,
      );

      expect(
        [...externalMembers.values()].map(
          (entry) => `${entry.owner.name}::${entry.member.name}`,
        ),
      ).toEqual(["str::trim"]);
    });

    it("prefers the type's own member over the one it dereferences to", () => {
      const source = "fn f(s: String) { s.capacity(); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        wrappers,
      );

      expect([...externalMembers.values()][0].owner.name).toBe("String");
    });

    it("substitutes a type parameter from how the receiver was written", () => {
      // `Arc<T>` targets `T`, and only `Arc<String>` says what `T` was.
      const source =
        "use std::sync::Arc;\nfn f(a: Arc<String>) { a.capacity(); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        wrappers,
      );

      expect(
        [...externalMembers.values()].map((entry) => entry.owner.name),
      ).toEqual(["String"]);
    });

    it("claims nothing for a name neither the wrapper nor its target has", () => {
      const source =
        "use std::sync::Arc;\nfn f(a: Arc<String>) { a.nonexistent(); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        wrappers,
      );

      expect(externalMembers.size).toBe(0);
    });
  });

  describe("conversion bounds", () => {
    const paths = withExternals([
      {
        ...external("std::path::Path", "struct"),
        members: [
          {
            name: "is_dir",
            kind: "method",
            signature: "pub fn is_dir(&self) -> bool",
            doc: null,
            returns: "bool",
          },
        ],
      },
    ]);

    it("spends an AsRef bound through its method", () => {
      // `p` is not a `Path`; `p.as_ref()` is. Modelling it the other way round would resolve
      // `p.is_dir()`, which does not compile.
      const source =
        "use std::path::Path;\nfn f<P: AsRef<Path>>(p: P) { p.as_ref().is_dir(); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        paths,
      );

      expect(
        [...externalMembers.values()].map((entry) => entry.member.name),
      ).toEqual(["is_dir"]);
    });

    it("reads the same bound written inline as an argument", () => {
      const source =
        "use std::path::Path;\nfn f(p: impl AsRef<Path>) { p.as_ref().is_dir(); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        paths,
      );

      expect(
        [...externalMembers.values()].map((entry) => entry.member.name),
      ).toEqual(["is_dir"]);
    });

    it("does not give the bound value the target's members directly", () => {
      const source =
        "use std::path::Path;\nfn f<P: AsRef<Path>>(p: P) { p.is_dir(); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        paths,
      );

      expect(externalMembers.size).toBe(0);
    });
  });

  describe("type aliases", () => {
    // `AtomicU64` is `Atomic<u64>`, and `Atomic<T>` has one inherent impl per integer width.
    const atomics = withExternals([
      {
        ...external("core::sync::atomic::AtomicU64", "type_alias"),
        aliasOf: "Atomic<u64>",
        members: [],
      },
      {
        ...external("core::sync::atomic::Atomic", "struct"),
        members: [
          {
            name: "fetch_add",
            kind: "method",
            signature: "pub fn fetch_add(&self, val: i8) -> i8",
            doc: null,
            returns: "i8",
            subject: "Atomic<i8>",
          },
          {
            name: "fetch_add",
            kind: "method",
            signature: "pub fn fetch_add(&self, val: u64) -> u64",
            doc: null,
            returns: "u64",
            subject: "Atomic<u64>",
          },
          {
            name: "into_inner",
            kind: "method",
            signature: "pub fn into_inner(self) -> T",
            doc: null,
            returns: "T",
          },
        ],
      },
      { ...external("u64", "primitive", "std"), members: [] },
    ]);

    it("follows an alias to the type that has the members", () => {
      const source =
        "use std::sync::atomic::AtomicU64;\nfn f(c: AtomicU64) { c.fetch_add(1); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        atomics,
      );

      expect(
        [...externalMembers.values()].map((entry) => entry.member.name),
      ).toEqual(["fetch_add"]);
    });

    it("picks the member from the impl the alias actually names", () => {
      // Twelve impls define `fetch_add`. Taking the first described an `AtomicU64` as returning
      // an `i8`, which is worse than saying nothing.
      const source =
        "use std::sync::atomic::AtomicU64;\nfn f(c: AtomicU64) { c.fetch_add(1); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        atomics,
      );

      expect([...externalMembers.values()][0].member.returns).toBe("u64");
    });

    it("binds a local to what the chosen member returns", () => {
      const source =
        "use std::sync::atomic::AtomicU64;\nfn f(c: AtomicU64) { let n = c.fetch_add(1); }";
      const { variables } = resolveExpressions(
        source,
        readScope(source),
        atomics,
      );

      expect(
        [...variables.values()].find((entry) => entry.name === "n")?.path,
      ).toBe("u64");
    });

    it("claims nothing when no impl matches the receiver", () => {
      // `Atomic<i128>` has no impl here, and guessing one would describe the wrong widths.
      const source =
        "use std::sync::atomic::Atomic;\nfn f(c: Atomic<i128>) { c.fetch_add(1); }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        atomics,
      );

      expect(externalMembers.size).toBe(0);
    });
  });

  describe("enum variants and newtype patterns", () => {
    const std = withExternals(
      [
        {
          ...external("core::sync::atomic::Ordering", "enum"),
          members: [
            {
              name: "Relaxed",
              kind: "variant",
              signature: "Relaxed",
              doc: null,
              returns: null,
            },
          ],
        },
        { ...external("core::cmp::Ordering", "enum"), members: [] },
        {
          ...external("alloc::string::String", "struct"),
          members: [
            {
              name: "len",
              kind: "method",
              signature: "pub fn len(&self) -> usize",
              doc: null,
              returns: "usize",
            },
          ],
        },
      ],
      [],
      { "upwell::axum::prelude::Path": "axum::extract::path::Path" },
    );

    it("resolves a variant written on an external enum", () => {
      const source =
        "use std::sync::atomic::Ordering;\nfn f() { let o = Ordering::Relaxed; }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        std,
      );

      expect(
        [...externalMembers.values()].map((entry) => entry.member.kind),
      ).toEqual(["variant"]);
    });

    it("lets the import pick between two enums of the same name", () => {
      // `std::sync::atomic::Ordering` is recorded at `core::sync::atomic::Ordering`, because
      // rustdoc keys items by where they are defined and `std` merely re-exports them. Against
      // `core::cmp::Ordering` the import shares three trailing segments rather than one.
      const source =
        "use std::sync::atomic::Ordering;\nfn f() { let o = Ordering::Relaxed; }";
      const { externalMembers } = resolveExpressions(
        source,
        readScope(source),
        std,
      );

      expect([...externalMembers.values()][0].owner.path).toBe(
        "core::sync::atomic::Ordering",
      );
    });

    it("binds a newtype pattern from the annotation rather than the wrapper", () => {
      // `Path(who): Path<String>` hands over a `String`. The wrapper is another crate's extractor
      // whose field is not indexed at all, so its own field could never answer.
      const source =
        "use upwell::axum::prelude::*;\nasync fn h(Path(who): Path<String>) { who.len(); }";
      const { variables, externalMembers } = resolveExpressions(
        source,
        readScope(source),
        std,
      );

      expect(
        [...variables.values()].find((entry) => entry.name === "who")?.path,
      ).toBe("alloc::string::String");
      expect(
        [...externalMembers.values()].map((entry) => entry.member.name),
      ).toEqual(["len"]);
    });

    it("binds nothing when the newtype annotation carries no argument", () => {
      const source =
        "use upwell::axum::prelude::*;\nasync fn h(Path(who): Path) { }";
      const { variables } = resolveExpressions(source, readScope(source), std);

      expect(
        [...variables.values()].some((entry) => entry.name === "who"),
      ).toBe(false);
    });
  });

  it("resolves nothing when the index has no external tier at all", () => {
    expect(findExternal("Arc", testIndex([]))).toBeUndefined();
  });
});
