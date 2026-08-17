import { beforeEach, describe, expect, it } from "vitest";

import {
  exampleContextPreprocessor,
  resetExampleContext,
  sharedContextFor,
} from "./example-context.ts";

const DECLARES = `use upwell::prelude::*;

pub struct Greeter {
    prefix: String,
}`;

const USES = `fn run(greeter: Greeter) {
    greeter.greet();
}`;

/** Runs the preprocessor over a page source, as the build does before mdsvex. */
function preprocess(content: string): void {
  exampleContextPreprocessor().markup?.({
    content,
    filename: "page.svx",
  } as never);
}

function page(body: string): string {
  return `---\ntitle: A page\n---\n\n${body}\n`;
}

function fence(code: string, meta = ""): string {
  return ["```rust" + meta, code, "```"].join("\n");
}

describe("exampleContextPreprocessor", () => {
  beforeEach(resetExampleContext);

  it("gives a block the declarations of its siblings in the same example", () => {
    preprocess(
      page(
        `<Example>\n\n${fence(DECLARES)}\n\nThen use it:\n\n${fence(USES)}\n\n</Example>`,
      ),
    );

    expect([...(sharedContextFor(USES)?.keys() ?? [])]).toEqual([
      "Greeter",
      "Greeter::prefix",
    ]);
  });

  it("does not give a block its own declarations, which it reads for itself", () => {
    preprocess(
      page(`<Example>\n\n${fence(DECLARES)}\n\n${fence(USES)}\n\n</Example>`),
    );

    const inherited = [...(sharedContextFor(DECLARES)?.keys() ?? [])];

    // Its own are read from the block itself, where their line numbers are meaningful and a jump
    // to the definition is possible. What it inherits is the sibling's `run`, and only that.
    expect(inherited).toEqual(["run"]);
    expect(inherited).not.toContain("Greeter");
  });

  it("shares nothing for a block outside any example", () => {
    preprocess(page(`${fence(DECLARES)}\n\n${fence(USES)}`));

    expect(sharedContextFor(USES)).toBeUndefined();
  });

  it("keeps two examples on one page separate", () => {
    const other = "pub struct Other {\n    value: u8,\n}";

    preprocess(
      page(
        `<Example>\n\n${fence(DECLARES)}\n\n${fence(USES)}\n\n</Example>\n\n` +
          `<Example>\n\n${fence(other)}\n\n${fence("fn go(o: Other) {}")}\n\n</Example>`,
      ),
    );

    // The second example must not be able to answer for a name declared in the first: a wrong
    // annotation is worse than a missing one, and cross-example leakage is exactly that.
    expect([...(sharedContextFor("fn go(o: Other) {}")?.keys() ?? [])]).toEqual(
      ["Other", "Other::value"],
    );
  });

  it("ignores a block marked plain, which opts out of annotation entirely", () => {
    preprocess(
      page(
        `<Example>\n\n${fence(DECLARES, " plain")}\n\n${fence(USES)}\n\n</Example>`,
      ),
    );

    expect([...(sharedContextFor(USES)?.keys() ?? [])]).toEqual([]);
  });

  it("shares nothing for an example with a single block", () => {
    preprocess(page(`<Example>\n\n${fence(DECLARES)}\n\n</Example>`));

    expect(sharedContextFor(DECLARES)).toBeUndefined();
  });

  it("matches a block whose trailing whitespace differs, as mdsvex hands it over", () => {
    preprocess(
      page(`<Example>\n\n${fence(DECLARES)}\n\n${fence(USES)}\n\n</Example>`),
    );

    expect(sharedContextFor(`${USES}\n`)).toBeDefined();
  });
});

describe("block visibility", () => {
  beforeEach(resetExampleContext);

  it("lets a context block contribute without being one of the rendered blocks", () => {
    // The point of `context`: a supporting data type an example needs in order to annotate, but
    // which is not what the example is about and should not take up half the page.
    preprocess(
      page(
        `<Example>\n\n${fence(DECLARES, " context")}\n\n${fence(USES)}\n\n</Example>`,
      ),
    );

    expect([...(sharedContextFor(USES)?.keys() ?? [])]).toEqual([
      "Greeter",
      "Greeter::prefix",
    ]);
  });

  it("lets a collapsed block contribute too", () => {
    preprocess(
      page(
        `<Example>\n\n${fence(DECLARES, " collapsed")}\n\n${fence(USES)}\n\n</Example>`,
      ),
    );

    expect([...(sharedContextFor(USES)?.keys() ?? [])]).toEqual([
      "Greeter",
      "Greeter::prefix",
    ]);
  });
});
