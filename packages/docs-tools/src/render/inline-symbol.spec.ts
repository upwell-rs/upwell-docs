import { describe, expect, it } from "vitest";

import { testSymbol } from "../fixtures.ts";
import type { RenderContext } from "./highlight.ts";
import { inlineSymbolPreprocessor } from "./inline-symbol.ts";
import type { Symbol } from "../rustdoc/symbols.ts";

function symbol(path: string, overrides: Partial<Symbol> = {}): Symbol {
  return testSymbol(path, {
    crate: "upwell-axum",
    signature: "pub struct HttpRequest",
    doc: "A request-scoped lifetime.",
    source: { file: "crates/axum/src/scope.rs", line: 12 },
    feature: "axum",
    ...overrides,
  });
}

/** A context shaped like the one the build assembles, with one documented and one bare symbol. */
function context(): RenderContext {
  const scope = symbol("upwell_axum::scope::HttpRequest");
  const component = symbol("upwell_macros::component", {
    kind: "proc_macro",
    signature: "#[component]",
  });

  return {
    index: {
      paths: {
        "upwell_axum::scope::HttpRequest": "upwell_axum::scope::HttpRequest",
        "upwell::axum::HttpRequest": "upwell_axum::scope::HttpRequest",
        "upwell_macros::component": "upwell_macros::component",
        "upwell::prelude::component": "upwell_macros::component",
      },
      names: {
        HttpRequest: ["upwell_axum::scope::HttpRequest"],
        component: ["upwell_macros::component"],
      },
      symbols: new Map([
        ["upwell_axum::scope::HttpRequest", scope],
        ["upwell_macros::component", component],
      ]),
    },
    // Only `component` has a hand-written page.
    docsHref: (path) =>
      path === "upwell_macros::component"
        ? {
            href: "/docs/__DOCS_VERSION__/symbols/upwell/prelude/component",
            title: "component",
          }
        : undefined,
    sourceHref: () => "https://example.invalid/src#L12",
  };
}

/** Text a reader sees, with the markup stripped. */
function renderedText(html: string): string {
  const inner =
    /<code class="symbol-ref">.*?<(?:a|span)[^>]*>(.*?)<\/(?:a|span)><\/code>/s.exec(
      html,
    );

  return (inner?.[1] ?? "").replace(/<[^>]*>/g, "");
}

async function preprocess(content: string): Promise<string> {
  const result = await inlineSymbolPreprocessor(async () => context()).markup?.(
    {
      content,
      filename: "/src/content/docs/di.svx",
    },
  );

  return (result as { code: string } | undefined)?.code ?? content;
}

describe("inlineSymbolPreprocessor", () => {
  it("leaves a page with no references untouched", async () => {
    const source = "<p>Nothing to see.</p>";

    await expect(preprocess(source)).resolves.toBe(source);
  });

  it("renders a reference as inline code carrying the symbol metadata", async () => {
    const code = await preprocess(
      '<p>The <Symbol path="upwell::axum::HttpRequest" /> scope.</p>',
    );

    expect(code).toContain('class="symbol-ref"');
    expect(code).toContain('data-symbol="upwell::axum::HttpRequest"');
    expect(code).toContain('data-symbol-signature="pub struct HttpRequest"');
    expect(code).toContain('data-symbol-feature="axum"');
  });

  it("shows the last path segment by default", async () => {
    const code = await preprocess(
      '<Symbol path="upwell::axum::HttpRequest" />',
    );

    expect(renderedText(code)).toBe("HttpRequest");
  });

  it("shows the whole path when asked", async () => {
    const code = await preprocess(
      '<Symbol path="upwell::axum::HttpRequest" full />',
    );

    // Shiki splits a path across several coloured spans, so the assertion is on the text a reader
    // sees rather than on any one element.
    expect(renderedText(code)).toBe("upwell::axum::HttpRequest");
  });

  it("accepts a custom label", async () => {
    const code = await preprocess(
      '<Symbol path="upwell::axum::HttpRequest" label="the request scope" />',
    );

    expect(code).toContain("the request scope");
  });

  it("links a facade re-export to its canonical symbol page", async () => {
    const code = await preprocess(
      '<Symbol path="upwell::prelude::component" />',
    );

    // The resolver canonicalises the facade path before looking up authored references. Version is
    // resolved per render, as in a code block.
    expect(code).toContain(
      'href="/docs/{__docsVersion}/symbols/upwell/prelude/component"',
    );
  });

  it("renders a symbol without a page as a span rather than a dead link", async () => {
    const code = await preprocess(
      '<Symbol path="upwell::axum::HttpRequest" />',
    );

    expect(code).toContain('<span class="symbol"');
    expect(code).not.toContain('<a class="symbol"');
  });

  it("highlights the text with the same themes a code block uses", async () => {
    const code = await preprocess(
      '<Symbol path="upwell::axum::HttpRequest" />',
    );

    expect(code).toContain("--shiki-light:");
    expect(code).toContain("--shiki-dark:");
  });

  it("replaces every reference on a page", async () => {
    const code = await preprocess(
      '<Symbol path="upwell::axum::HttpRequest" /> and <Symbol path="upwell::prelude::component" />',
    );

    expect(code).not.toContain("<Symbol");
  });

  it("fails the build for a symbol that does not exist", async () => {
    // Silently rendering plain text would look deliberate, which is why prose is stricter than a
    // code block here.
    await expect(preprocess('<Symbol path="upwell::Nope" />')).rejects.toThrow(
      /does not resolve/,
    );
  });

  it("suggests where a mistyped path is actually defined", async () => {
    await expect(
      preprocess('<Symbol path="upwell::wrong::HttpRequest" />'),
    ).rejects.toThrow(/defined at: upwell_axum::scope::HttpRequest/);
  });

  it("names the page a bad reference is on", async () => {
    await expect(preprocess('<Symbol path="upwell::Nope" />')).rejects.toThrow(
      /di\.svx/,
    );
  });

  it("rejects a reference with no path", async () => {
    await expect(preprocess("<Symbol />")).rejects.toThrow(/without a path/);
  });

  it("escapes braces in documentation, which Svelte would read as an expression", async () => {
    const braces = inlineSymbolPreprocessor(async () => {
      const base = context();
      const withBraces = symbol("upwell_axum::scope::HttpRequest", {
        doc: "Use {} for defaults.",
      });

      return {
        ...base,
        index: {
          ...base.index!,
          symbols: new Map([["upwell_axum::scope::HttpRequest", withBraces]]),
        },
      };
    });

    const result = await braces.markup?.({
      content: '<Symbol path="upwell::axum::HttpRequest" />',
      filename: "/src/content/docs/di.svx",
    });

    expect((result as { code: string }).code).toContain("&#123;&#125;");
  });
});
