/**
 * A hand-written symbol page.
 *
 * The URL uses `/` where Rust uses `::`, matching the file's location under `src/content/symbols`,
 * so `framework::prelude::component` is `.../symbols/framework/prelude/component`.
 *
 * Runs on the server so the symbol index never reaches a browser; only this symbol's facts are
 * serialised into the page.
 */

import { building } from "$app/env";
import { error } from "@sveltejs/kit";

import { isSymbolEnrichmentEligible, resolveVersion } from "#lib/docs/config";
import { docsConfig } from "virtual:docs-config";
import { findSymbolPage, symbolPagesFor } from "#lib/docs/content/symbol-pages";
import { topicForCrate } from "#lib/docs/content/topics";
import { getArtifact, getSymbolInfo } from "#lib/server/artifact";
import { suggestSymbols } from "@upwell/docs-tools/artifact/load";
import type { EntryGenerator, PageServerLoad } from "./$types";

// A fresh template has no symbol pages. `auto` prerenders generated entries when they exist without
// rejecting the dynamic route itself when the optional Rustdoc workflow has not been configured yet.
export const prerender = "auto";

/**
 * Only symbols that have a hand-written page are prerendered.
 *
 * This is the whole difference from a generated API reference: the site has as many symbol pages as
 * someone chose to write, not one per symbol.
 */
export const entries: EntryGenerator = async () => {
  const generated: { version: string; path: string }[] = [];

  for (const version of docsConfig.versions) {
    // A release without a prepared artifact has no facts to put on a symbol page, so it gets
    // none. Its guides still render, with highlighting but no code lens.
    if (
      !isSymbolEnrichmentEligible(docsConfig, version) ||
      !(await getArtifact(version))
    ) {
      continue;
    }

    for (const page of symbolPagesFor(version.releaseVersion)) {
      generated.push({ version: version.id, path: page.segments });
    }
  }

  return generated;
};

export const load: PageServerLoad = async ({ params }) => {
  const version = resolveVersion(docsConfig, params.version);

  if (!version) {
    error(404, {
      message: `There is no documentation for version "${params.version}".`,
    });
  }

  const page = findSymbolPage(params.path, version.releaseVersion);

  if (!isSymbolEnrichmentEligible(docsConfig, version)) {
    error(404, {
      message: `${version.releaseVersion.raw} publishes authored guides without API symbol pages.`,
    });
  }

  if (!page) {
    const artifact = await getArtifact(version);
    const requested = params.path.replaceAll("/", "::");

    // A symbol with no page is an ordinary miss, not a mistake: most symbols have none, and are
    // annotated in code blocks without one. Suggestions point at symbols that *do* have a page.
    error(404, {
      message: `No page documents "${requested}" in ${docsConfig.framework.name} docs ${version.releaseVersion.raw}.`,
      suggestions: artifact
        ? suggestSymbols(artifact, requested).filter((candidate) =>
            Boolean(
              findSymbolPage(
                candidate.replaceAll("::", "/"),
                version.releaseVersion,
              ),
            ),
          )
        : [],
    });
  }

  const symbol = await getSymbolInfo(version, page.symbol);

  if (!symbol) {
    // Unreachable in a complete build: the same check runs over every symbol page when the
    // artifact loads, so this would already have failed. Kept because the load path must not
    // depend on that having happened.
    error(404, {
      message: `The ${version.releaseVersion.raw} artifact has no symbol "${page.symbol}".`,
    });
  }

  if (building) {
    assertTopicMatchesCrate(page, symbol.crate);
  }

  return {
    version,
    page,
    symbol,
    chrome: {
      slug: `symbols/${page.segments}`,
      title: page.title,
      section: "API reference",
      reference: true,
    },
  };
};

/**
 * Checks that a symbol page files itself under the topic its crate belongs to.
 *
 * The declaration has to live in frontmatter, because the sidebar filters without an artifact
 * loaded and a symbol's crate is known only to the server. This is what stops the two from
 * drifting — and it runs here because prerendering visits every symbol page, so a build covers all
 * of them. Guarded by `building` so a misconfiguration cannot turn into a 500 for a reader.
 */
function assertTopicMatchesCrate(
  page: { segments: string; topics: readonly string[] },
  crate: string,
): void {
  const expected = topicForCrate(crate);

  if (!expected || page.topics.includes(expected.id)) {
    return;
  }

  throw new Error(
    `Symbol page src/content/symbols/${page.segments}.svx does not declare the topic its crate belongs to.\n\n` +
      `  Crate:     ${crate} (topic "${expected.id}")\n` +
      `  Declared:  ${page.topics.length > 0 ? page.topics.join(", ") : "none"}\n\n` +
      `  Add to its frontmatter:\n    topics: ['${expected.id}']\n`,
  );
}
