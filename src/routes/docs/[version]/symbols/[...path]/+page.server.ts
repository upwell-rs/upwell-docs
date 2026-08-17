/**
 * A hand-written symbol page.
 *
 * The URL uses `/` where Rust uses `::`, matching the file's location under `src/content/symbols`,
 * so `framework::prelude::component` is `.../symbols/framework/prelude/component`.
 *
 * Runs on the server so the symbol index never reaches a browser; only this symbol's facts are
 * serialised into the page.
 */

import { docsServerRoutes } from '#lib/docs/runtime.server';
import type { EntryGenerator, PageServerLoad } from "./$types";

// A fresh template has no symbol pages. `auto` prerenders generated entries when they exist without
// rejecting the dynamic route itself when the optional Rustdoc workflow has not been configured yet.
export const prerender = "auto";

/** Authored pages and active generated canonical declaration paths are prerendered. */
export const entries: EntryGenerator = () => docsServerRoutes.symbolEntries();

export const load: PageServerLoad = ({ params }) => docsServerRoutes.loadSymbol(params);
