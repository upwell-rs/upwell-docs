import { describe, expect, it } from "vitest";

import { markdownFromPageSource } from "./markdown-export.ts";

describe("markdownFromPageSource", () => {
  it("drops frontmatter and the script block, keeping the prose that follows", () => {
    const source = [
      "---",
      "title: Getting started",
      "order: 1",
      "---",
      "",
      '<script lang="ts">',
      "\timport { Example } from '#lib/docs';",
      "</script>",
      "",
      "# Getting started",
      "",
      "An Upwell application is ordinary Rust.",
      "",
    ].join("\n");

    expect(markdownFromPageSource(source)).toBe(
      "# Getting started\n\nAn Upwell application is ordinary Rust.\n",
    );
  });

  it("keeps what a wrapper contains, including every code block", () => {
    const source = [
      '<Example title="A first component">',
      "",
      "```rust",
      "#[component]",
      "struct Greeter;",
      "```",
      "",
      "Then use it:",
      "",
      "```rust",
      "greeter.greet();",
      "```",
      "",
      "</Example>",
    ].join("\n");
    const markdown = markdownFromPageSource(source);

    expect(markdown).toContain("```rust\n#[component]\nstruct Greeter;\n```");
    expect(markdown).toContain("greeter.greet();");
    expect(markdown).not.toContain("<Example");
  });

  it("keeps every tab's content, since all of them are worth reading", () => {
    const source = [
      "{#snippet withCargo()}",
      "",
      "Use Cargo alone.",
      "",
      "{/snippet}",
      "",
      "{#snippet withTooling()}",
      "",
      "Use the tool.",
      "",
      "{/snippet}",
      "",
      "<Tabs labels={['Cargo only', 'Tool']} panels={[withCargo, withTooling]} />",
    ].join("\n");
    const markdown = markdownFromPageSource(source);

    expect(markdown).toContain("Use Cargo alone.");
    expect(markdown).toContain("Use the tool.");
    expect(markdown).not.toContain("snippet");
    expect(markdown).not.toContain("Tabs");
  });

  it("renders a symbol reference as the code it reads as", () => {
    const labelled = markdownFromPageSource(
      'The <Symbol path="upwell::prelude::component" label="#[component]" /> attribute registers it.',
    );
    const bare = markdownFromPageSource(
      'See <Symbol path="upwell::axum::Axum" /> for defaults.',
    );

    expect(labelled).toBe("The `#[component]` attribute registers it.\n");
    expect(bare).toBe("See `upwell::axum::Axum` for defaults.\n");
  });

  it("leaves a fenced example alone, however much it looks like the page's own markup", () => {
    const source = [
      "# Writing a page",
      "",
      "A page may show one:",
      "",
      "````svx",
      "<script>",
      "\timport { Example } from '#lib/docs';",
      "</script>",
      "",
      "<Example title=\"Inside a fence\">",
      "",
      "{#snippet body()}",
      "",
      "</Example>",
      "````",
      "",
      "That is the shape.",
    ].join("\n");
    const markdown = markdownFromPageSource(source);

    // The one output that promises to keep code cannot be the one that deletes the example.
    expect(markdown).toContain("<script>");
    expect(markdown).toContain('<Example title="Inside a fence">');
    expect(markdown).toContain("{#snippet body()}");
    expect(markdown).toContain("</Example>");
    expect(markdown).toContain("That is the shape.");
  });

  it("points a relative link at the exported copy, and leaves every other kind alone", () => {
    const source = [
      "See [the advanced guide](advanced) and [one section](advanced#lifetimes).",
      "",
      "Also [the reference](/docs/latest/symbols/upwell_macros/app), [upstream](https://example.com), and [a heading](#usage).",
      "",
      "![diagram](assets/plan.png)",
    ].join("\n");
    const markdown = markdownFromPageSource(source, {
      relativeLinkSuffix: ".md",
      exports: (destination) => destination === "advanced",
    });

    expect(markdown).toContain("[the advanced guide](advanced.md)");
    expect(markdown).toContain("[one section](advanced.md#lifetimes)");
    // An absolute path, an external URL and a fragment all already resolve; an image is a file.
    expect(markdown).toContain("[the reference](/docs/latest/symbols/upwell_macros/app)");
    expect(markdown).toContain("[upstream](https://example.com)");
    expect(markdown).toContain("[a heading](#usage)");
    expect(markdown).toContain("![diagram](assets/plan.png)");
  });

  it("does not rewrite a link written inside a code block", () => {
    const source = ['```md', '[the advanced guide](advanced)', '```'].join("\n");
    const markdown = markdownFromPageSource(source, { relativeLinkSuffix: ".md", exports: () => true });

    expect(markdown).toContain("[the advanced guide](advanced)\n```");
  });

  it("keeps a query and a fragment outside the name it rewrites", () => {
    const asked: string[] = [];
    const markdown = markdownFromPageSource("See [advanced](advanced?view=full#lifetimes).", {
      relativeLinkSuffix: ".md",
      exports: (destination) => {
        asked.push(destination);

        return destination === "advanced";
      },
    });

    expect(markdown).toContain("[advanced](advanced.md?view=full#lifetimes)");
    // The caller is asked about the page, not about what was said of it.
    expect(asked).toEqual(["advanced"]);
  });

  it("leaves a relative link alone when it does not name another export", () => {
    const source = 'Read the [configuration](example.toml) and the [archive](files/sample.zip).';
    const markdown = markdownFromPageSource(source, {
      relativeLinkSuffix: ".md",
      // A relative link is not necessarily a page, and `example.toml.md` is worse than the original.
      exports: (destination) => destination === "advanced",
    });

    expect(markdown).toContain("[configuration](example.toml)");
    expect(markdown).toContain("[archive](files/sample.zip)");
  });

  it("rewrites nothing without a way to tell which destinations are pages", () => {
    const markdown = markdownFromPageSource('See [the advanced guide](advanced).', { relativeLinkSuffix: ".md" });

    expect(markdown).toContain("[the advanced guide](advanced)");
  });

  it("collapses the blank lines that removing a wrapper leaves behind", () => {
    const source = "# Title\n\n<Example>\n\n\nBody.\n\n\n</Example>\n";

    expect(markdownFromPageSource(source)).toBe("# Title\n\nBody.\n");
  });
});
