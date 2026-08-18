import type { LoadedIndex } from "../artifact/load.ts";

export {
  isLocal,
  LOCAL_CRATE,
  resolveExpressions,
  resolveMembers,
  type ResolvedExpressions,
  type ResolvedExternalMember,
  type ResolvedVariable,
} from "./expression.ts";
export {
  externalFromScope,
  findExternal,
  readScope,
  resolveToken,
  type ResolvedToken,
  type ResolverIndex,
  type SnippetScope,
  type TokenPosition,
} from "./resolve.ts";
export { readDeclarations, type Declaration } from "./declarations.ts";

import type { ResolverIndex } from "./resolve.ts";

/** Adapts a loaded artifact index to the shared lexical and expression resolver. */
export function createResolverIndex(index: LoadedIndex): ResolverIndex {
  const externals = index.externals ?? { symbols: [], names: {}, direct: [], aliases: {} };

  return {
    paths: index.paths ?? {},
    names: index.names ?? {},
    symbols: new Map(index.symbols.map((symbol) => [symbol.path, symbol])),
    externals: {
      byPath: new Map((externals.symbols ?? []).map((symbol) => [symbol.path, symbol])),
      byName: externals.names ?? {},
      direct: new Set(externals.direct ?? []),
      aliases: externals.aliases ?? {},
    },
  };
}
