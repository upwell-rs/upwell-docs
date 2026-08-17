import { describe, expect, it } from "vitest";
import { testIndex as index, type TestEntry } from "../fixtures.ts";
import { readScope, resolveToken } from "./resolve.ts";

describe("readScope", () => {
  it("reads a plain import", () => {
    const scope = readScope("use upwell::axum::Stomp;");

    expect(scope.imports.get("Stomp")).toBe("upwell::axum::Stomp");
  });

  it("expands a brace group", () => {
    const scope = readScope("use upwell::{Singleton, axum::Stomp};");

    expect([...scope.imports]).toEqual([
      ["Singleton", "upwell::Singleton"],
      ["Stomp", "upwell::axum::Stomp"],
    ]);
  });

  it("expands nested brace groups", () => {
    const scope = readScope("use upwell::{axum::{Stomp, JsonWs}};");

    expect([...scope.imports.keys()]).toEqual(["Stomp", "JsonWs"]);
  });

  it("binds the local name of a renamed import", () => {
    const scope = readScope("use upwell::axum::Stomp as Broker;");

    expect(scope.imports.get("Broker")).toBe("upwell::axum::Stomp");
  });

  it("records glob imports as module prefixes", () => {
    const scope = readScope("use upwell::prelude::*;");

    expect(scope.globs).toEqual(["upwell::prelude"]);
  });

  it("resolves a self import to the module itself", () => {
    const scope = readScope("use upwell::axum::{self, Stomp};");

    expect(scope.imports.get("axum")).toBe("upwell::axum");
  });

  it("ignores an underscore import, which binds no name", () => {
    const scope = readScope("use upwell::Component as _;");

    expect(scope.imports.size).toBe(0);
  });

  it("reads several use statements", () => {
    const scope = readScope(
      "use upwell::prelude::*;\nuse upwell::axum::Stomp;\n\nfn main() {}",
    );

    expect(scope.globs).toEqual(["upwell::prelude"]);
    expect(scope.imports.get("Stomp")).toBe("upwell::axum::Stomp");
  });
});

describe("resolveToken", () => {
  const framework = index([
    {
      canonical: "upwell_axum_stomp::Stomp",
      reachableAt: ["upwell::axum::Stomp"],
    },
    {
      canonical: "upwell_core::scope::Singleton",
      reachableAt: ["upwell::Singleton", "upwell::prelude::Singleton"],
    },
    {
      canonical: "upwell_di::descriptors::component::Component",
      reachableAt: ["upwell::prelude::Component"],
    },
  ]);

  it("resolves a token named by an explicit import", () => {
    const scope = readScope("use upwell::axum::Stomp;");
    const resolved = resolveToken("Stomp", scope, framework);

    expect(resolved).toMatchObject({
      via: "import",
      path: "upwell::axum::Stomp",
    });
  });

  it("resolves a token reachable through a glob import", () => {
    const scope = readScope("use upwell::prelude::*;");
    const resolved = resolveToken("Component", scope, framework, {
      attribute: true,
    });

    expect(resolved).toMatchObject({
      via: "glob",
      path: "upwell::prelude::Component",
    });
  });

  it("prefers an explicit import over a glob", () => {
    const scope = readScope("use upwell::prelude::*;\nuse upwell::Singleton;");
    const resolved = resolveToken("Singleton", scope, framework);

    expect(resolved).toMatchObject({
      via: "import",
      path: "upwell::Singleton",
    });
  });

  it("resolves an unambiguous name that the snippet never imports", () => {
    const resolved = resolveToken("Stomp", readScope(""), framework);

    expect(resolved).toMatchObject({
      via: "unique",
      path: "upwell_axum_stomp::Stomp",
    });
  });

  it("resolves nothing for an ambiguous name", () => {
    const ambiguous = index([
      { canonical: "upwell_axum::Config" },
      { canonical: "upwell_config::Config" },
    ]);

    expect(resolveToken("Config", readScope(""), ambiguous)).toBeUndefined();
  });

  it("resolves nothing for a keyword", () => {
    expect(resolveToken("struct", readScope(""), framework)).toBeUndefined();
  });

  it("resolves nothing for a std prelude name, even if the framework defines one", () => {
    const shadowing = index([{ canonical: "upwell_core::Result" }]);

    expect(resolveToken("Result", readScope(""), shadowing)).toBeUndefined();
  });

  it("resolves nothing for something that is not an identifier", () => {
    expect(resolveToken("->", readScope(""), framework)).toBeUndefined();
  });

  it("does not resolve a bare lowercase name the snippet never imports", () => {
    const helpers = index([{ canonical: "upwell_core::id" }]);

    // A field or local called `id` is far more likely than a reference to a framework function
    // that the snippet did not import.
    expect(
      resolveToken("id", readScope("let ticket_id = ticket.id;"), helpers),
    ).toBeUndefined();
  });

  it("resolves a lowercase glob match in attribute position", () => {
    const helpers = index([
      {
        canonical: "upwell_macros::component",
        reachableAt: ["upwell::prelude::component"],
      },
    ]);
    const scope = readScope("use upwell::prelude::*;");

    expect(
      resolveToken("component", scope, helpers, { attribute: true }),
    ).toMatchObject({ via: "glob" });
  });

  it("does not resolve a lowercase glob match outside attribute position", () => {
    const helpers = index([
      {
        canonical: "upwell_axum::message",
        reachableAt: ["upwell::axum::prelude::message"],
      },
    ]);
    const scope = readScope("use upwell::axum::prelude::*;");

    // `let (message, count) = …` binds a local; the prelude happening to export a macro of the
    // same name must not turn it into a link.
    expect(resolveToken("message", scope, helpers)).toBeUndefined();
  });

  it("still resolves a lowercase name the snippet imported by name", () => {
    const helpers = index([
      {
        canonical: "upwell_axum::message",
        reachableAt: ["upwell::axum::message"],
      },
    ]);
    const scope = readScope("use upwell::axum::message;");

    expect(resolveToken("message", scope, helpers)).toMatchObject({
      via: "import",
    });
  });

  it("resolves a type-like glob match anywhere", () => {
    const scope = readScope("use upwell::prelude::*;");

    expect(resolveToken("Component", scope, framework)).toMatchObject({
      via: "glob",
    });
  });

  it("does not resolve an enum variant, which is only ever written qualified", () => {
    const variants = index([
      {
        canonical: "upwell_axum::controller::HttpInputSource::Path",
        overrides: { kind: "variant" },
      },
    ]);

    expect(resolveToken("Path", readScope(""), variants)).toBeUndefined();
  });

  it("resolves nothing when an import names a symbol the framework does not have", () => {
    const scope = readScope("use upwell::Nonexistent;");

    expect(resolveToken("Nonexistent", scope, framework)).toBeUndefined();
  });

  describe("macro invocations", () => {
    /**
     * The `app` collision as the framework actually has it: a proc macro re-exported through the
     * prelude, and a module of the same name in another crate.
     */
    const macros: readonly TestEntry[] = [
      {
        canonical: "upwell_macros::app",
        reachableAt: ["upwell::app", "upwell::prelude::app"],
        overrides: { kind: "proc_macro" },
      },
      { canonical: "upwell_app::app", overrides: { kind: "module" } },
    ];

    it("resolves a lowercase macro reached through a glob import", () => {
      // `app!` is lowercase, so the caution that protects `let (message, count) = …` applies to
      // it — but a `!` means it cannot be a local, which is what lifts that caution.
      const scope = readScope("use upwell::prelude::*;");

      expect(
        resolveToken("app", scope, index(macros), { macroCall: true }),
      ).toMatchObject({
        via: "glob",
        path: "upwell::prelude::app",
      });
    });

    it("does not resolve the same name without the invocation mark", () => {
      const scope = readScope("use upwell::prelude::*;");

      expect(resolveToken("app", scope, index(macros))).toBeUndefined();
    });

    it("prefers the macro over a module of the same name", () => {
      // `upwell_app::app` is a module and shares the name. Without the kind filter the
      // framework-wide fallback sees two candidates and gives up, so `app!` resolved to nothing.
      expect(
        resolveToken("app", readScope(""), index(macros), { macroCall: true }),
      ).toMatchObject({
        path: "upwell_macros::app",
      });
    });

    it("resolves an attribute name to the macro, never to a module of the same name", () => {
      // `#[controller(path = "…")]` is a proc macro; the facade also re-exports a *module* called
      // `controller`, and a module cannot appear in attribute position at all.
      const both = index([
        {
          canonical: "upwell_axum_macros::controller",
          reachableAt: ["upwell::axum::prelude::controller"],
          overrides: { kind: "proc_macro" },
        },
        { canonical: "upwell_axum::controller", overrides: { kind: "module" } },
      ]);

      expect(
        resolveToken("controller", readScope(""), both, {
          attribute: true,
          attributeName: true,
        }),
      ).toMatchObject({
        path: "upwell_axum_macros::controller",
      });
    });

    it("still resolves an attribute argument as the type it is", () => {
      // `#[component(scope = HttpRequest)]` — only the attribute's *name* is restricted to macros.
      const types = index([
        {
          canonical: "upwell_axum::scope::HttpRequest",
          reachableAt: ["upwell::axum::HttpRequest"],
        },
      ]);

      expect(
        resolveToken("HttpRequest", readScope(""), types, { attribute: true }),
      ).toMatchObject({
        path: "upwell_axum::scope::HttpRequest",
      });
    });

    it("resolves nothing for a name whose only match is not a macro", () => {
      const scope = readScope("use upwell::prelude::*;");

      expect(
        resolveToken("Component", scope, framework, { macroCall: true }),
      ).toBeUndefined();
    });
  });
});
