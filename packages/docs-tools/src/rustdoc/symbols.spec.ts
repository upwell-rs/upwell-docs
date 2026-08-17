import { describe, expect, it } from "vitest";
import { buildSymbolIndex, type RustdocInput } from "./symbols.ts";
import type { RustdocCrate, RustdocItem } from "./types.ts";

/** Builds a rustdoc-shaped document, so tests exercise the real reader rather than a stand-in. */
function crateDoc(options: {
  items: Record<
    string,
    Partial<RustdocItem> & { inner: Record<string, unknown> }
  >;
  paths?: Record<string, string[]>;
  /** Id of the crate's root module. */
  root: string;
}): RustdocCrate {
  const index: Record<string, RustdocItem> = {};

  for (const [id, item] of Object.entries(options.items)) {
    index[id] = {
      id: Number(id),
      crate_id: 0,
      name: null,
      span: null,
      visibility: "public",
      docs: null,
      links: {},
      attrs: [],
      deprecation: null,
      ...item,
    } as RustdocItem;
  }

  return {
    root: Number(options.root),
    crate_version: "0.20.0",
    includes_private: false,
    index,
    paths: Object.fromEntries(
      Object.entries(options.paths ?? {}).map(([id, path]) => [
        id,
        { crate_id: 0, path, kind: "struct" },
      ]),
    ),
    external_crates: {},
    format_version: 61,
  };
}

function input(crate: string, doc: RustdocCrate): RustdocInput {
  return { crate, file: `${crate}.json`, doc };
}

const NO_FEATURES = { facadeCrate: "upwell", cratesByFeature: {} };

describe("buildSymbolIndex", () => {
  it("indexes a public item at its defining path", () => {
    const core = crateDoc({
      root: "100",
      items: {
        "1": {
          name: "Singleton",
          inner: { struct: { generics: { params: [], where_predicates: [] } } },
        },
        "100": { name: "upwell_core", inner: { module: { items: [1] } } },
      },
      paths: { "1": ["upwell_core", "scope", "Singleton"] },
    });

    const index = buildSymbolIndex([input("upwell-core", core)], NO_FEATURES);

    expect(index.symbols).toHaveLength(1);
    expect(index.symbols[0]).toMatchObject({
      path: "upwell_core::scope::Singleton",
      kind: "struct",
      crate: "upwell-core",
    });
  });

  it("resolves a facade re-export to the defining path", () => {
    const core = crateDoc({
      root: "100",
      items: {
        "1": {
          name: "Singleton",
          inner: { struct: { generics: { params: [], where_predicates: [] } } },
        },
        "100": { name: "upwell_core", inner: { module: { items: [1] } } },
      },
      paths: { "1": ["upwell_core", "scope", "Singleton"] },
    });

    const facade = crateDoc({
      root: "200",
      items: {
        "201": {
          inner: {
            use: {
              source: "upwell_core::scope::Singleton",
              name: "Singleton",
              is_glob: false,
            },
          },
        },
        "200": { name: "upwell", inner: { module: { items: [201] } } },
      },
    });

    const index = buildSymbolIndex(
      [input("upwell-core", core), input("upwell", facade)],
      NO_FEATURES,
    );

    expect(index.paths["upwell::Singleton"]).toBe(
      "upwell_core::scope::Singleton",
    );
  });

  it("follows a chain of re-exports, which is what facade paths actually are", () => {
    // `upwell` re-exports `upwell_di::Component`, which is itself `upwell_di`'s re-export of
    // `upwell_di::descriptors::Component`. One pass would resolve neither.
    const di = crateDoc({
      root: "100",
      items: {
        "1": {
          name: "Component",
          inner: { trait: { generics: { params: [], where_predicates: [] } } },
        },
        "2": {
          inner: {
            use: {
              source: "descriptors::Component",
              name: "Component",
              is_glob: false,
            },
          },
        },
        "100": { name: "upwell_di", inner: { module: { items: [1, 2] } } },
      },
      paths: { "1": ["upwell_di", "descriptors", "Component"] },
    });

    const facade = crateDoc({
      root: "200",
      items: {
        "201": {
          inner: {
            use: {
              source: "upwell_di::Component",
              name: "Component",
              is_glob: false,
            },
          },
        },
        "200": { name: "upwell", inner: { module: { items: [201] } } },
      },
    });

    const index = buildSymbolIndex(
      [input("upwell-di", di), input("upwell", facade)],
      NO_FEATURES,
    );

    expect(index.paths["upwell_di::Component"]).toBe(
      "upwell_di::descriptors::Component",
    );
    expect(index.paths["upwell::Component"]).toBe(
      "upwell_di::descriptors::Component",
    );
  });

  it("expands a glob re-export to each direct child", () => {
    const dirs = crateDoc({
      root: "100",
      items: {
        "1": {
          name: "Dir",
          inner: { struct: { generics: { params: [], where_predicates: [] } } },
        },
        "100": { name: "upwell_dirs", inner: { module: { items: [1] } } },
      },
      paths: { "1": ["upwell_dirs", "Dir"] },
    });

    const facade = crateDoc({
      root: "200",
      items: {
        "202": {
          inner: {
            use: { source: "upwell_dirs", name: "upwell_dirs", is_glob: true },
          },
        },
        "201": { name: "dirs", inner: { module: { items: [202] } } },
        "200": { name: "upwell", inner: { module: { items: [201] } } },
      },
    });

    const index = buildSymbolIndex(
      [input("upwell-dirs", dirs), input("upwell", facade)],
      NO_FEATURES,
    );

    expect(index.paths["upwell::dirs::Dir"]).toBe("upwell_dirs::Dir");
  });

  it("labels a symbol with the facade feature that reaches its crate", () => {
    const stomp = crateDoc({
      root: "100",
      items: {
        "1": {
          name: "Stomp",
          inner: { struct: { generics: { params: [], where_predicates: [] } } },
        },
        "100": { name: "upwell_axum_stomp", inner: { module: { items: [1] } } },
      },
      paths: { "1": ["upwell_axum_stomp", "Stomp"] },
    });

    const index = buildSymbolIndex([input("upwell-axum-stomp", stomp)], {
      facadeCrate: "upwell",
      cratesByFeature: { "upwell-axum-stomp": "stomp" },
    });

    expect(index.symbols[0].feature).toBe("stomp");
  });

  it("reduces a doc comment to its first paragraph as plain text", () => {
    const core = crateDoc({
      root: "100",
      items: {
        "1": {
          name: "Greeter",
          docs: "Declares a **system-constructed** [`Component`] on a struct.\n\nA second paragraph that the card never shows.",
          inner: { struct: { generics: { params: [], where_predicates: [] } } },
        },
        "100": { name: "upwell_core", inner: { module: { items: [1] } } },
      },
      paths: { "1": ["upwell_core", "Greeter"] },
    });

    const index = buildSymbolIndex([input("upwell-core", core)], NO_FEATURES);

    expect(index.symbols[0].doc).toBe(
      "Declares a system-constructed Component on a struct.",
    );
  });

  it("records the source location relative to the repository root", () => {
    const core = crateDoc({
      root: "100",
      items: {
        "1": {
          name: "Greeter",
          span: {
            filename: "crates/core/src/scope.rs",
            begin: [94, 1],
            end: [96, 2],
          },
          inner: { struct: { generics: { params: [], where_predicates: [] } } },
        },
        "100": { name: "upwell_core", inner: { module: { items: [1] } } },
      },
      paths: { "1": ["upwell_core", "Greeter"] },
    });

    const index = buildSymbolIndex([input("upwell-core", core)], NO_FEATURES);

    expect(index.symbols[0].source).toEqual({
      file: "crates/core/src/scope.rs",
      line: 94,
    });
  });

  it("rejects a rustdoc format version it has not been checked against", () => {
    const future = {
      ...crateDoc({ root: "100", items: {} }),
      format_version: 999,
    };

    expect(() =>
      buildSymbolIndex([input("upwell-core", future)], NO_FEATURES),
    ).toThrowError(/format version 999/);
  });
});
