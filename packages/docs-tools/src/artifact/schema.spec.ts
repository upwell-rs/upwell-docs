import { describe, expect, it } from "vitest";

import { testSymbol } from "../fixtures.ts";
import type { LoadedArtifact } from "./load.ts";
import { symbolSourceLink } from "./load.ts";
import { parseManifest, parseSymbolShard, sourceLink } from "./schema.ts";

describe("parseSymbolShard", () => {
  it("defaults fields absent from compatible old artifacts", () => {
    const oldSymbol = { ...testSymbol("upwell::Thing") } as Record<string, unknown>;
    delete oldSymbol.docs;
    delete oldSymbol.procMacro;

    expect(parseSymbolShard([oldSymbol], "upwell.json")[0]).toMatchObject({
      docs: null,
      procMacro: null,
    });
  });

  it("accepts explicit procedural-macro metadata", () => {
    const symbol = testSymbol("upwell_macros::Component", {
      kind: "proc_macro",
      procMacro: { kind: "derive", helpers: ["component", "inject"] },
    });

    expect(parseSymbolShard([symbol], "upwell-macros.json")[0].procMacro).toEqual({
      kind: "derive",
      helpers: ["component", "inject"],
    });
  });

  it.each([
    [{ kind: "function", helpers: [] }, "procMacro.kind"],
    [{ kind: "derive", helpers: [1] }, "procMacro.helpers[0]"],
    [{ kind: "derive" }, "procMacro.helpers"],
  ])("rejects malformed procedural-macro metadata", (procMacro, field) => {
    const symbol = { ...testSymbol("upwell_macros::Component"), procMacro };

    expect(() => parseSymbolShard([symbol], "upwell-macros.json")).toThrow(field);
  });
});

describe("source inventory", () => {
  it("accepts additive tracked-file metadata", () => {
    const manifest = {
      schemaVersion: 3,
      framework: { name: "Upwell", crate: "upwell", version: "1.0.0", crates: ["upwell"] },
      documentation: { releaseVersion: "1.0.0", sourcePackageVersion: "1.0.0" },
      git: { sha: "abc", tag: null, repository: "https://github.com/upwell-rs/upwell", dirty: false },
      generatedAt: "2026-08-18T00:00:00.000Z",
      generator: { name: "test", version: "1", origin: "release", rustdocFormatVersion: 1 },
      rust: { toolchain: null, edition: "2024" },
      capabilities: ["symbols", "sources"],
      sourceLinkTemplate: "https://github.com/upwell-rs/upwell/blob/abc/{path}#L{line}",
      sources: [{
        crate: "upwell",
        version: "1.0.0",
        repository: "https://github.com/upwell-rs/upwell",
        sha: "abc",
        crates: ["upwell"],
        primary: true,
        files: [{ path: "src/lib.rs", bytes: 42 }, { path: "src/empty.rs", bytes: 0 }],
      }],
      contents: { symbols: "symbols" },
    };

    expect(parseManifest(manifest).sources?.[0].files).toEqual([
      { path: "src/lib.rs", bytes: 42 },
      { path: "src/empty.rs", bytes: 0 },
    ]);
  });
});

describe("sourceLink", () => {
  it("uses a crate's repository when an aggregate artifact defines one", () => {
    const manifest = {
      sourceLinkTemplate: "https://github.com/upwell-rs/upwell/blob/main/{path}#L{line}",
      sourceLinkTemplates: {
        "upwell-axum": "https://github.com/upwell-rs/upwell-axum/blob/abc123/{path}#L{line}",
      },
    } as unknown as Parameters<typeof sourceLink>[0];

    expect(sourceLink(manifest, "src/lib.rs", 42, "upwell-axum")).toBe(
      "https://github.com/upwell-rs/upwell-axum/blob/abc123/src/lib.rs#L42",
    );
    expect(sourceLink(manifest, "crates/core/src/lib.rs", 7, "upwell-core")).toBe(
      "https://github.com/upwell-rs/upwell/blob/main/crates/core/src/lib.rs#L7",
    );
  });

  it("routes a loaded symbol to its owning repository", () => {
    const artifact = {
      manifest: {
        sourceLinkTemplate: "https://github.com/upwell-rs/upwell/blob/main/{path}#L{line}",
        sourceLinkTemplates: {
          "upwell-rpc": "https://github.com/upwell-rs/upwell-rpc/blob/def456/{path}#L{line}",
        },
      },
    } as unknown as LoadedArtifact;
    const symbol = testSymbol("upwell_rpc::Rpc", {
      crate: "upwell-rpc",
      source: { file: "src/lib.rs", line: 19 },
    });

    expect(symbolSourceLink(artifact, symbol)).toBe(
      "https://github.com/upwell-rs/upwell-rpc/blob/def456/src/lib.rs#L19",
    );
  });
});
