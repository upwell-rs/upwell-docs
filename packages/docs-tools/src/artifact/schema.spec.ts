import { describe, expect, it } from "vitest";

import { testSymbol } from "../fixtures.ts";
import { parseSymbolShard } from "./schema.ts";

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
