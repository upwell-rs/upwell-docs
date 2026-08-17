import { describe, expect, it } from "vitest";

import {
  applyVersionExpression,
  VERSION_EXPRESSION,
  VERSION_SENTINEL,
  versionExpressionPreprocessor,
} from "./version-expression.ts";

/** Runs the preprocessor the way Svelte does, returning the code it produced. */
function preprocess(content: string): string {
  const result = versionExpressionPreprocessor(
    "#lib/docs/version.svelte",
  ).markup?.({ content, filename: "/src/content/docs/x.svx" });

  return (result as { code: string } | undefined)?.code ?? content;
}

/** The module script mdsvex always emits for frontmatter. */
const MODULE_SCRIPT =
  '<script context="module">\n\texport const metadata = {"title":"A"};\n</script>';

describe("applyVersionExpression", () => {
  it("turns a sentinel symbol link into a Svelte expression", () => {
    const html = `<a href="/docs/${VERSION_SENTINEL}/symbols/upwell/prelude/component">`;

    expect(applyVersionExpression(html)).toBe(
      '<a href="/docs/{__docsVersion}/symbols/upwell/prelude/component">',
    );
  });

  it("leaves a bare sentinel alone, so page content cannot be rewritten by accident", () => {
    // The token is replaced only as part of a symbol-link path; a page that happens to contain it
    // in its own code must survive untouched.
    const html = `<code>${VERSION_SENTINEL}</code>`;

    expect(applyVersionExpression(html)).toBe(html);
  });

  it("replaces every symbol link on a page", () => {
    const html = `<a href="/docs/${VERSION_SENTINEL}/symbols/a"><a href="/docs/${VERSION_SENTINEL}/symbols/b">`;

    expect(applyVersionExpression(html)).not.toContain(VERSION_SENTINEL);
  });
});

describe("versionExpressionPreprocessor", () => {
  it("leaves a page without symbol links untouched", () => {
    const source = `${MODULE_SCRIPT}\n<h1>Hi</h1>`;

    expect(preprocess(source)).toBe(source);
  });

  it("declares the variable inside an existing instance script", () => {
    const source = `${MODULE_SCRIPT}\n<script>\n\tconst x = 1;\n</script>\n<a href="/docs/${VERSION_EXPRESSION}/symbols/a">`;
    const code = preprocess(source);

    expect(code).toContain("const __docsVersion =");
    // One instance script, not two: the declaration goes inside the author's own.
    expect(code.match(/<script>/g)).toHaveLength(1);
  });

  it("adds an instance script to a page that has only the module script", () => {
    // mdsvex emits no instance script for a page whose author wrote none, and context can only be
    // read during component initialisation — so one has to exist.
    const code = preprocess(
      `${MODULE_SCRIPT}\n<a href="/docs/${VERSION_EXPRESSION}/symbols/a">`,
    );

    expect(code).toContain("const __docsVersion =");
    expect(code).toContain("<script>");
  });

  it("does not mistake the module script for an instance script", () => {
    const code = preprocess(
      `${MODULE_SCRIPT}\n<a href="/docs/${VERSION_EXPRESSION}/symbols/a">`,
    );

    // The declaration must not land in `context="module"`, which runs once per module rather than
    // once per component and cannot read context at all.
    expect(code.indexOf("const __docsVersion =")).toBeLessThan(
      code.indexOf('context="module"'),
    );
  });

  it("handles a module script written with the modern attribute", () => {
    const source = `<script module>\n\texport const metadata = {};\n</script>\n<a href="/docs/${VERSION_EXPRESSION}/symbols/a">`;
    const code = preprocess(source);

    expect(code).toContain("const __docsVersion =");
    expect(code.indexOf("const __docsVersion =")).toBeLessThan(
      code.indexOf("<script module>"),
    );
  });

  it("imports the accessor it declares", () => {
    const code = preprocess(
      `${MODULE_SCRIPT}\n<a href="/docs/${VERSION_EXPRESSION}/symbols/a">`,
    );

    expect(code).toContain("from '#lib/docs/version.svelte'");
  });
});
