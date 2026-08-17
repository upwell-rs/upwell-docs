import { describe, expect, it } from "vitest";

import { readDeclarations } from "./declarations.ts";

/** The declarations a snippet contributes, as `path -> kind`, which is what callers key on. */
function declared(code: string): Record<string, string> {
  return Object.fromEntries(
    [...readDeclarations(code)].map(([path, entry]) => [path, entry.kind]),
  );
}

describe("readDeclarations", () => {
  it("reads a struct and its fields", () => {
    expect(
      declared(`pub struct Greeter {
    prefix: String,
    pub count: usize,
}`),
    ).toEqual({
      Greeter: "struct",
      "Greeter::prefix": "struct_field",
      "Greeter::count": "struct_field",
    });
  });

  it("reads an enum and its variants", () => {
    expect(
      declared(`pub enum Mode {
    Fast,
    Slow(u32),
}`),
    ).toEqual({
      Mode: "enum",
      "Mode::Fast": "variant",
      "Mode::Slow": "variant",
    });
  });

  it("distinguishes a method from an associated function by its receiver", () => {
    expect(
      declared(`impl Greeter {
    pub fn new() -> Self { todo!() }
    pub fn greet(&self) -> String { todo!() }
}`),
    ).toEqual({ "Greeter::new": "assoc_fn", "Greeter::greet": "method" });
  });

  it("attributes members to the type of an `impl Trait for Type` block", () => {
    // The type is the subject, not the trait, so the members belong to `Greeter`.
    expect(
      declared("impl Component for Greeter {\n    fn configure(&self) {}\n}"),
    ).toEqual({
      "Greeter::configure": "method",
    });
  });

  it("reads a free function at the top level", () => {
    expect(declared("pub fn run() {}")).toEqual({ run: "function" });
  });

  it("records where a declaration is, so a use of it can point back", () => {
    const found = readDeclarations(
      "use upwell::prelude::*;\n\nstruct Greeter {\n    prefix: String,\n}",
    );

    expect(found.get("Greeter")).toMatchObject({
      line: 3,
      signature: "struct Greeter",
    });
    expect(found.get("Greeter::prefix")).toMatchObject({ line: 4 });
  });

  it("carries a doc comment written above the declaration", () => {
    const found = readDeclarations(
      "/// Greets people by name.\nstruct Greeter {}",
    );

    expect(found.get("Greeter")?.doc).toBe("Greets people by name.");
  });

  it("records a return type, so a local method can continue a chain", () => {
    const found = readDeclarations(
      "impl Greeter {\n    fn config(&self) -> AxumConfig { todo!() }\n}",
    );

    expect(found.get("Greeter::config")?.returns).toBe("AxumConfig");
  });

  it("records a field type for the same reason", () => {
    const found = readDeclarations(
      "struct Holder {\n    config: AxumConfig,\n}",
    );

    expect(found.get("Holder::config")?.returns).toBe("AxumConfig");
  });

  it("does not mistake a local inside a function body for a field", () => {
    expect(
      declared("fn run() {\n    let prefix: String = String::new();\n}"),
    ).toEqual({ run: "function" });
  });

  it("keeps the first of two declarations of a name", () => {
    // A snippet showing a before and an after is explaining the first one.
    const found = readDeclarations(
      "struct Greeter {\n    a: u8,\n}\n\nstruct Greeter {\n    b: u8,\n}",
    );

    expect(found.get("Greeter")?.line).toBe(1);
  });

  it("finds nothing in a snippet that declares nothing", () => {
    expect(declared("let app = App::builder().build();\napp.serve();")).toEqual(
      {},
    );
  });
});
