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

  it("collapses the blank lines that removing a wrapper leaves behind", () => {
    const source = "# Title\n\n<Example>\n\n\nBody.\n\n\n</Example>\n";

    expect(markdownFromPageSource(source)).toBe("# Title\n\nBody.\n");
  });
});
