import { describe, expect, it } from "vitest";

import { semanticKind } from "./highlight.ts";

/**
 * The colour groups exist to make a dense snippet readable at a glance, so what matters is that the
 * distinctions a reader draws — noun, verb, value — survive, and that nothing lands in a group by
 * accident.
 */
describe("semanticKind", () => {
  it("groups everything callable together", () => {
    expect(["function", "method", "assoc_fn"].map(semanticKind)).toEqual([
      "callable",
      "callable",
      "callable",
    ]);
  });

  it("keeps macros apart from ordinary calls", () => {
    // A macro is not a function, and in Rust the difference changes what the code does.
    expect(["macro", "proc_macro"].map(semanticKind)).toEqual([
      "macro",
      "macro",
    ]);
  });

  it("groups the values a reader writes by name", () => {
    expect(["variant", "constant", "assoc_const"].map(semanticKind)).toEqual([
      "value",
      "value",
      "value",
    ]);
  });

  it("gives fields their own group", () => {
    expect(semanticKind("struct_field")).toBe("field");
  });

  it("treats every kind of type as one group", () => {
    expect(
      [
        "struct",
        "enum",
        "trait",
        "type_alias",
        "union",
        "primitive",
        "assoc_type",
      ].map(semanticKind),
    ).toEqual(["type", "type", "type", "type", "type", "type", "type"]);
  });

  it("falls back to the type group for a kind it has not seen", () => {
    // rustdoc adds kinds; an unknown one reading as a type is the least surprising outcome.
    expect(semanticKind("something_new")).toBe("type");
  });
});
