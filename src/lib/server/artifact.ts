/**
 * Server-side access to the documentation artifact.
 *
 * Lives under `src/lib/server` so SvelteKit refuses to bundle it into the browser: it reads the
 * filesystem, and the symbol index must never reach a client. Only the one symbol a page documents
 * is serialised into that page.
 *
 * Loaded once per process and shared. Symbol pages are prerendered, so in a production build this
 * runs at build time and its cost is paid once for the whole site.
 */

import process from "node:process";

import { isSymbolEnrichmentEligible, type DocsVersion } from "#lib/docs/config";
import { docsConfig } from "virtual:docs-config";
import { findSymbolPage } from "#lib/docs/content/symbol-pages";
import type {
  SymbolInfo,
  SymbolLink,
  SymbolMember,
} from "#lib/docs/symbol.svelte";
import {
  artifactDir,
  findSymbol,
  type LoadedArtifact,
  loadArtifact,
  symbolSourceLink,
} from "@upwell/docs-tools/artifact/load";
import {
  MEMBER_SYMBOL_KINDS,
  type Symbol,
} from "@upwell/docs-tools/rustdoc/symbols";

const cache = new Map<string, Promise<LoadedArtifact | null>>();

/**
 * The artifact for a documented release, or null when it has not been prepared.
 *
 * A missing artifact is not an error. Preparing one runs rustdoc over a checkout of that release,
 * which is minutes of work and needs the release checked out — so a site documenting several
 * versions will routinely have caches for some and not others. What a release loses without one is
 * the code lens: guides still render and code is still highlighted, but identifiers are not
 * annotated and symbol pages have no facts to show, so they are not generated for it.
 */
export function getArtifact(
  version: DocsVersion,
): Promise<LoadedArtifact | null> {
  if (!isSymbolEnrichmentEligible(docsConfig, version)) {
    return Promise.resolve(null);
  }

  const key = artifactVersion(version);
  const existing = cache.get(key);

  if (existing) {
    return existing;
  }

  const loading = loadArtifact(
    artifactDir(process.cwd(), docsConfig.cacheDir, key),
    key,
  ).catch(() => null);

  cache.set(key, loading);

  return loading;
}

/** Artifact identity is the public documentation release. Source provenance stays in its manifest. */
export function artifactVersion(version: DocsVersion): string {
  return version.releaseVersion.raw;
}

/**
 * The facts a symbol page needs about its symbol.
 *
 * Returns undefined when the release has no such symbol, which the route turns into a 404. That is
 * not the same as an authored mistake: a symbol page whose symbol does not exist fails the build,
 * because the build lists the pages and checks each one.
 */
export async function getSymbolInfo(
  version: DocsVersion,
  symbolPath: string,
): Promise<SymbolInfo | undefined> {
  const artifact = await getArtifact(version);
  const symbol = artifact ? findSymbol(artifact, symbolPath) : undefined;

  if (!artifact || !symbol) {
    return undefined;
  }

  return {
    path: symbolPath,
    canonicalPath: symbol.path,
    name: symbol.name,
    kind: symbol.kind,
    crate: symbol.crate,
    signature: symbol.signature,
    doc: symbol.doc,
    feature: symbol.feature,
    deprecation: symbol.deprecation,
    sourceHref: symbolSourceLink(artifact, symbol),
    source: symbol.source,
    implementations: symbol.implementations,
    implementors: symbol.implementors.map((path) =>
      toLink(artifact, version, path),
    ),
    members: collectMembers(artifact, symbol),
  };
}

/**
 * Resolves a symbol path to something a page can render.
 *
 * The page cannot do this itself: resolving a canonical path to the spelling a reader would use, and
 * asking whether the site documents it, both need the index, which never leaves the server.
 */
function toLink(
  artifact: LoadedArtifact,
  version: DocsVersion,
  canonical: string,
): SymbolLink {
  const path = preferredPath(artifact, canonical);
  const page = findSymbolPage(
    path.replaceAll("::", "/"),
    version.releaseVersion,
  );

  return {
    path,
    name: path.split("::").pop() ?? path,
    href: page ? `/docs/${version.id}/symbols/${page.segments}` : null,
  };
}

/** The path a reader would write for a symbol: fewest segments, then shortest. */
function preferredPath(artifact: LoadedArtifact, canonical: string): string {
  let best = canonical;

  for (const [reachable, target] of Object.entries(artifact.index.paths)) {
    if (target !== canonical) {
      continue;
    }

    const bySegments = reachable.split("::").length - best.split("::").length;

    if (
      bySegments < 0 ||
      (bySegments === 0 && reachable.length < best.length)
    ) {
      best = reachable;
    }
  }

  return best;
}

/** Order members are listed in: the shape of the type first, then how it is built, then behaviour. */
const MEMBER_ORDER: readonly string[] = [
  "assoc_type",
  "assoc_const",
  "struct_field",
  "variant",
  "assoc_fn",
  "method",
];

/**
 * The members declared directly on a symbol.
 *
 * Found by prefix over the canonical path rather than from a stored list: a member's identity *is*
 * its path under its owner, so the index needs no second edge to say what belongs to what. Only
 * direct members are taken — a nested path would be a member of a member, which Rust does not have.
 */
function collectMembers(
  artifact: LoadedArtifact,
  owner: Symbol,
): SymbolMember[] {
  const prefix = `${owner.path}::`;
  const members: { member: SymbolMember; rank: number }[] = [];

  for (const symbol of artifact.index.symbols) {
    if (
      !symbol.path.startsWith(prefix) ||
      symbol.path.slice(prefix.length).includes("::")
    ) {
      continue;
    }

    if (!MEMBER_SYMBOL_KINDS.has(symbol.kind)) {
      continue;
    }

    members.push({
      rank: MEMBER_ORDER.indexOf(symbol.kind),
      member: {
        name: symbol.name,
        kind: symbol.kind,
        signature: symbol.signature,
        doc: symbol.doc,
        deprecated: symbol.deprecation !== null,
        sourceHref: symbolSourceLink(artifact, symbol),
      },
    });
  }

  return members
    .sort(
      (a, b) => a.rank - b.rank || a.member.name.localeCompare(b.member.name),
    )
    .map((entry) => entry.member);
}
