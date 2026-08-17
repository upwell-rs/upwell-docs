/**
 * A hand-written symbol page.
 *
 * The URL uses `/` where Rust uses `::`, matching the file's location under `src/content/symbols`,
 * so `framework::prelude::component` is `.../symbols/framework/prelude/component`.
 *
 * Runs on the server so the symbol index never reaches a browser; only this symbol's facts are
 * serialised into the page.
 */

import { dev } from '$app/env';
import { resolvePrerender } from '@upwell/docs-core/config';
import { docsServerRoutes } from '#lib/docs/runtime.server';
import { docsConfig } from 'virtual:docs-config';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = resolvePrerender(docsConfig, 'symbols', dev);

/** Static symbol pages are rendered concurrently; version-level catalog data is shared and cached. */
export const entries: EntryGenerator = () => docsServerRoutes.symbolEntries();

export const load: PageServerLoad = ({ params }) => docsServerRoutes.loadSymbol(params);
