/**
 * Heading anchors, and the document index.
 *
 * A rehype plugin that gives every `h2`/`h3` a stable id and a linkable anchor at compile time —
 * so a deep link works before any JavaScript runs, and with JavaScript disabled — and records the
 * page's headings and prose for search while it is already walking the tree.
 *
 * Both are plain tree walks over hast, not parsing: mdsvex has already produced the tree.
 */

import {
  collapse,
  type IndexedHeading,
  recordDocument,
} from "./document-index.ts";

/** Minimal hast shapes. Only what a heading walk touches is modelled. */
interface HastText {
  type: "text";
  value: string;
}

interface HastElement {
  type: "element";
  tagName: string;
  properties: Record<string, unknown>;
  children: HastNode[];
}

type HastNode =
  HastText | HastElement | { type: string; children?: HastNode[] };

function isElement(node: HastNode): node is HastElement {
  return node.type === "element";
}

/** Readable text of a heading, used to derive its slug. */
function textOf(node: HastNode): string {
  if (node.type === "text") {
    return (node as HastText).value;
  }

  const children = (node as { children?: HastNode[] }).children ?? [];

  return children.map(textOf).join("");
}

/**
 * Slug for a heading.
 *
 * Deliberately conservative: lowercase, alphanumerics and dashes only. Anchors end up in published
 * URLs, so a predictable, boring slug matters more than preserving punctuation.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Makes a slug unique within one page by suffixing repeats. */
function unique(slug: string, used: Map<string, number>): string {
  const count = used.get(slug) ?? 0;

  used.set(slug, count + 1);

  return count === 0 ? slug : `${slug}-${count + 1}`;
}

/**
 * rehype plugin adding ids and anchor links to `h2` and `h3`.
 *
 * `h1` is skipped: it is the page title, there is exactly one, and linking to it is what linking to
 * the page already does.
 */
export function rehypeHeadingAnchors() {
  return (
    tree: HastNode,
    file?: { filename?: string; path?: string },
  ): void => {
    const used = new Map<string, number>();
    const headings: IndexedHeading[] = [];
    const prose: string[] = [];

    walk(tree, used, headings, prose);

    const source = file?.filename ?? file?.path;

    if (source) {
      recordDocument({ file: source, headings, text: collapse(prose) });
    }
  };
}

/** Elements whose text is not prose and would only add noise to a search index. */
const NOT_PROSE = new Set(["pre", "code", "script", "style"]);

function walk(
  node: HastNode,
  used: Map<string, number>,
  headings: IndexedHeading[],
  prose: string[],
): void {
  const children = (node as { children?: HastNode[] }).children ?? [];

  for (const child of children) {
    if (
      isElement(child) &&
      (child.tagName === "h2" || child.tagName === "h3")
    ) {
      const heading = decorate(child, used);

      if (heading) {
        headings.push(heading);
      }

      continue;
    }

    if (isElement(child) && NOT_PROSE.has(child.tagName)) {
      continue;
    }

    if (child.type === "text") {
      prose.push((child as HastText).value);

      continue;
    }

    walk(child, used, headings, prose);
  }
}

function decorate(
  heading: HastElement,
  used: Map<string, number>,
): IndexedHeading | undefined {
  const text = textOf(heading);
  const existing =
    typeof heading.properties.id === "string" ? heading.properties.id : "";
  const id = unique(existing || slugify(text), used);

  if (id === "") {
    return undefined;
  }

  heading.properties.id = id;
  heading.properties.class = [heading.properties.class, "heading"]
    .filter(Boolean)
    .join(" ");

  heading.children.push({
    type: "element",
    tagName: "a",
    properties: {
      href: `#${id}`,
      class: "heading__anchor",
      "aria-label": `Link to this section: ${text}`,
    },
    children: [{ type: "text", value: "#" }],
  });

  return { id, text, depth: heading.tagName === "h2" ? 2 : 3 };
}
