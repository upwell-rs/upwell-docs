/**
 * Build-time discovery and validation of hand-written symbol pages.
 *
 * A symbol page's location *is* the symbol it documents, so finding which symbols have pages is a
 * directory listing — no frontmatter to read, nothing to keep in sync, and nothing to parse. That
 * is the whole reason the path encodes the symbol.
 *
 * Two things can rot independently and neither is visible at runtime: the symbol can be renamed
 * upstream, and two pages can end up documenting the same symbol through different re-export paths.
 * Both are caught here, when the artifact loads, rather than becoming a link to nothing.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";

import { type SemVer } from "@upwell/docs-core/semver";
import {
  groupByPath,
  normalizeVersionPath,
  resolveCandidate,
} from "@upwell/docs-core/overlay";
import { type LoadedArtifact, suggestSymbols } from "./artifact/load.ts";

/** A symbol page and the symbol it documents. */
export interface SymbolPageRef {
  /** Symbol path taken from the file's location, e.g. `framework::prelude::component`. */
  readonly symbol: string;
  /** URL segment form, e.g. `framework/prelude/component`. */
  readonly segments: string;
  /** File, relative to the project root, for error messages. */
  readonly file: string;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "ValidationError";
  }
}

/**
 * Lists every `.svx` under the symbol content directory as a candidate reference.
 *
 * Exact SemVer directory segments are release gates, not symbol segments. The selected candidate is
 * the same effective path candidate used by routes, navigation, search, and rendering.
 */
async function discover(
  symbolsDir: string,
  projectRoot: string,
  releaseVersion: SemVer,
): Promise<SymbolPageRef[]> {
  const entries = await readdir(symbolsDir, {
    withFileTypes: true,
    recursive: true,
  }).catch(() => []);
  const candidates: { relativePath: string; value: SymbolPageRef }[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".svx")) {
      continue;
    }

    const absolute = path.join(entry.parentPath, entry.name);
    const relativePath = path
      .relative(symbolsDir, absolute)
      .replace(/\.svx$/, "")
      .split(path.sep)
      .join("/");
    const { path: segments } = normalizeVersionPath(
      relativePath,
      "Symbol page",
    );

    candidates.push({
      relativePath,
      value: {
        symbol: segments.split("/").join("::"),
        segments,
        file: path.relative(projectRoot, absolute),
      },
    });
  }

  return [...groupByPath(candidates, "Symbol page").values()]
    .map((variants) => resolveCandidate(variants, releaseVersion))
    .filter((ref): ref is SymbolPageRef => ref !== undefined)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * Discovers symbol pages and checks each documents a symbol the release actually has.
 *
 * Returns the mapping the renderer needs: canonical symbol path to the page's URL segments. Keying
 * by canonical path is what lets a page written at `framework/prelude/component` be found by a snippet
 * that reached the same symbol through a different re-export.
 */
export async function resolveSymbolPages(
  artifact: LoadedArtifact,
  symbolsDir: string,
  projectRoot: string,
  releaseVersion: SemVer,
): Promise<Map<string, SymbolPageRef>> {
  const refs = await discover(symbolsDir, projectRoot, releaseVersion);
  const byCanonical = new Map<string, SymbolPageRef>();
  const problems: string[] = [];

  for (const ref of refs) {
    const canonical = artifact.index.paths[ref.symbol];

    if (!canonical) {
      const suggestions = suggestSymbols(artifact, ref.symbol, 3);
      const hint =
        suggestions.length > 0
          ? `\n\n  Did you mean:\n${suggestions.map((entry) => `    ${entry.replaceAll("::", "/")}.svx`).join("\n")}`
          : "\n\n  No similarly named symbol exists in this release.";

      problems.push(
        "A symbol page documents a symbol that does not exist.\n\n" +
          `  Page:\n    ${ref.file}\n\n` +
          `  Implies symbol:\n    ${ref.symbol}\n\n` +
          `  Framework version:\n    ${artifact.manifest.framework.version}${hint}\n\n` +
          "  A symbol page's location is the symbol it documents, so the fix is to move the file.",
      );

      continue;
    }

    const existing = byCanonical.get(canonical);

    if (existing) {
      if (existing.symbol === canonical) {
        continue;
      }

      if (ref.symbol === canonical) {
        byCanonical.set(canonical, ref);
        continue;
      }

      problems.push(
        "Two symbol pages document the same symbol.\n\n" +
          `  Pages:\n    ${existing.file}\n    ${ref.file}\n\n` +
          `  Both resolve to:\n    ${canonical}\n\n` +
          "  These are different re-export paths for one symbol. Keep one page and delete the other.",
      );

      continue;
    }

    byCanonical.set(canonical, ref);
  }

  if (problems.length > 0) {
    throw new ValidationError(`\n${problems.join("\n\n───\n\n")}\n`);
  }

  return byCanonical;
}
