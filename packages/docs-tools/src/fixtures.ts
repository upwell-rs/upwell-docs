/**
 * Test material for the documentation pipeline.
 *
 * Building a `Symbol` by hand takes a dozen fields, most of which any given test does not care
 * about — so each spec that needed one grew its own factory, and every field added to the record
 * had to be added to each of them. One factory here means a test states only the part it is about.
 *
 * Not a spec file, so the runner does not collect it.
 */

import type { Symbol } from "./rustdoc/symbols.ts";
import type { ResolverIndex } from "./render/resolve.ts";

/** A symbol with plausible defaults, overridden field by field. */
export function testSymbol(
  path: string,
  overrides: Partial<Symbol> = {},
): Symbol {
  return {
    path,
    name: path.split("::").pop() ?? path,
    kind: "struct",
    crate: "upwell-core",
    signature: null,
    doc: null,
    source: null,
    deprecation: null,
    feature: null,
    returns: null,
    implementations: [],
    implementors: [],
    derefTarget: null,
    aliasOf: null,
    ...overrides,
  };
}

/** One entry in a test index: a symbol, and any re-export paths it is also reachable at. */
export interface TestEntry {
  readonly canonical: string;
  readonly reachableAt?: readonly string[];
  readonly overrides?: Partial<Symbol>;
}

/**
 * An index built the way the generator builds one.
 *
 * Assembling `paths` and `names` here rather than hand-writing them per test is what keeps the
 * tests exercising the real lookup shape: a resolver bug that only shows up when an alias and a
 * canonical path disagree is invisible against a hand-written map where they never do.
 */
export function testIndex(entries: readonly TestEntry[]): ResolverIndex {
  const symbols = new Map<string, Symbol>();
  const paths: Record<string, string> = {};
  const names: Record<string, string[]> = {};

  for (const entry of entries) {
    const value = testSymbol(entry.canonical, entry.overrides);

    symbols.set(entry.canonical, value);
    paths[entry.canonical] = entry.canonical;

    for (const alias of entry.reachableAt ?? []) {
      paths[alias] = entry.canonical;
    }

    (names[value.name] ??= []).push(entry.canonical);
  }

  return { paths, names, symbols };
}
