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
import { error } from '@sveltejs/kit';

import { docsConfig, resolveVersion } from '#lib/docs/config';
import { buildSearchIndex } from '#lib/server/search-index';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => docsConfig.versions.map((version) => ({ version: version.id }));

export const GET: RequestHandler = async ({ params }) => {
	const version = resolveVersion(docsConfig, params.version);

	if (!version) {
		error(404, { message: `There is no documentation for version "${params.version}".` });
	}

	const index = await buildSearchIndex(version);

	return json(index);
};
