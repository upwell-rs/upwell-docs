import { beforeEach, describe, expect, it } from "vitest";

import {
  collapse,
  indexedDocuments,
  MAX_TEXT,
  recordDocument,
  resetDocumentIndex,
} from "./document-index.ts";
import { rehypeHeadingAnchors } from "./headings.ts";

/** Builds the hast shape mdsvex hands a rehype plugin. */
function element(
  tagName: string,
  children: unknown[],
  properties: Record<string, unknown> = {},
) {
  return { type: "element", tagName, properties, children };
}

function text(value: string) {
  return { type: "text", value };
}

function run(tree: unknown, filename = "/src/content/docs/routing.svx") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the plugin takes a hast tree.
  rehypeHeadingAnchors()(tree as any, { filename });
}

beforeEach(() => {
  resetDocumentIndex();
});

describe("collapse", () => {
  it("joins fragments and collapses whitespace", () => {
    expect(collapse(["A line\n", "  and   another"])).toBe(
      "A line and another",
    );
  });

  it("caps the stored text, because this is a search index and not an archive", () => {
    expect(collapse(["x".repeat(MAX_TEXT + 500)])).toHaveLength(MAX_TEXT);
  });
});

describe("rehypeHeadingAnchors", () => {
  it("gives headings ids and records them", () => {
    const tree = {
      type: "root",
      children: [element("h2", [text("Declaring a component")])],
    };

    run(tree);

    const heading = tree.children[0] as ReturnType<typeof element>;

    expect(heading.properties.id).toBe("declaring-a-component");
    expect(indexedDocuments()[0].headings).toEqual([
      { id: "declaring-a-component", text: "Declaring a component", depth: 2 },
    ]);
  });

  it("appends an anchor link to each heading", () => {
    const tree = { type: "root", children: [element("h2", [text("Scopes")])] };

    run(tree);

    const anchor = (tree.children[0] as ReturnType<typeof element>).children.at(
      -1,
    ) as ReturnType<typeof element>;

    expect(anchor.tagName).toBe("a");
    expect(anchor.properties.href).toBe("#scopes");
  });

  it("disambiguates repeated headings, since ids end up in published URLs", () => {
    const tree = {
      type: "root",
      children: [
        element("h2", [text("Options")]),
        element("h2", [text("Options")]),
      ],
    };

    run(tree);

    expect(indexedDocuments()[0].headings.map((heading) => heading.id)).toEqual(
      ["options", "options-2"],
    );
  });

  it("records prose for search", () => {
    const tree = {
      type: "root",
      children: [
        element("p", [text("Upwell resolves dependencies at compile time.")]),
      ],
    };

    run(tree);

    expect(indexedDocuments()[0].text).toBe(
      "Upwell resolves dependencies at compile time.",
    );
  });

  it("leaves code out of the prose, where it would only add noise", () => {
    const tree = {
      type: "root",
      children: [
        element("p", [text("Mark it:")]),
        element("pre", [
          element("code", [text("#[component] pub struct Greeter;")]),
        ]),
      ],
    };

    run(tree);

    expect(indexedDocuments()[0].text).toBe("Mark it:");
  });

  it("keys documents by file, so a recompile replaces rather than duplicates", () => {
    run({ type: "root", children: [element("p", [text("first")])] });
    run({ type: "root", children: [element("p", [text("second")])] });

    expect(indexedDocuments()).toHaveLength(1);
    expect(indexedDocuments()[0].text).toBe("second");
  });

  it("records nothing when the compiler gave no filename", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exercising the no-file path.
    rehypeHeadingAnchors()({ type: "root", children: [] } as any, undefined);

    expect(indexedDocuments()).toHaveLength(0);
  });

  it("uses a virtual guide's physical filename", () => {
    run(
      { type: "root", children: [element("p", [text("RPC prose")])] },
      "\0/src/content/docs/1/rpc/server/index.svx",
    );

    expect(indexedDocuments()[0].file).toBe(
      "/src/content/docs/1/rpc/server/index.svx",
    );
  });
});

describe("recordDocument", () => {
  it("orders documents by file, so output is stable across runs", () => {
    recordDocument({ file: "/b.svx", headings: [], text: "b" });
    recordDocument({ file: "/a.svx", headings: [], text: "a" });

    expect(indexedDocuments().map((document) => document.file)).toEqual([
      "/a.svx",
      "/b.svx",
    ]);
  });
});
