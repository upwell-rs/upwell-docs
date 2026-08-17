/**
 * The search index for one documented release, as static JSON.
 *
 * Prerendered rather than computed per request: the index is built from content that only changes
 * when the site is rebuilt, so it is a file, and serving it as one means search costs the server
 * nothing and works on a static host.
 *
 * It is fetched on demand rather than bundled into every page. A reader who never searches never
 * downloads it, and it is the one payload on this site that grows with the framework.
 */

import { json } from '@sveltejs/kit';
import { docsServerRoutes } from '#lib/docs/runtime.server';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => [...docsServerRoutes.searchEntries()];

export const GET: RequestHandler = async ({ params }) => json(await docsServerRoutes.loadSearch(params.version));
