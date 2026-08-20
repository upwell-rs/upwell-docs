import { building, dev } from '$app/env';
import { redirect } from '@sveltejs/kit';
import { resolvePrerender } from '@upwell/docs-core/config';

import { docsRoutes } from '#lib/docs/runtime';
import { guideRedirects } from '#lib/docs/guide-redirects';
import { docsConfig } from 'virtual:docs-config';
import type { EntryGenerator, PageLoad } from './$types';

export const prerender = resolvePrerender(docsConfig, 'redirects', dev);

export const entries: EntryGenerator = () => [
	...docsRoutes.latestEntries()
];

/** `latest` is a stable redirect alias; all rendered and shared URLs use the explicit release. */
export const load: PageLoad = ({ params, url }) => redirect(
	308,
	`${docsRoutes.latestTarget(guideRedirects[params.slug] ?? params.slug)}${building ? '' : `${url.search}${url.hash}`}`
);
