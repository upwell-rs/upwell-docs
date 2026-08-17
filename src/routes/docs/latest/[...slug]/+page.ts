import { redirect } from '@sveltejs/kit';

import { docsRoutes } from '#lib/docs/runtime';
import type { EntryGenerator, PageLoad } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => [...docsRoutes.latestEntries()];

/** `latest` is a stable redirect alias; all rendered and shared URLs use the explicit release. */
export const load: PageLoad = ({ params }) => redirect(308, docsRoutes.latestTarget(params.slug));
