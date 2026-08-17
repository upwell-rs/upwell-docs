/**
 * Resolves one authored page within a documented release.
 *
 * `entries` is what makes prerendering enumerate the site: a catch-all route has no discoverable
 * URLs, so every (version, slug) pair is listed from the content index. The empty slug is included
 * so `/docs/<version>` serves the landing page.
 */

import { error } from '@sveltejs/kit';

import { docsConfig } from 'virtual:docs-config';
import { findPage, loadPage, pagesFor, siblings } from '#lib/docs/content/pages';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () =>
	docsConfig.versions.flatMap((version) =>
		// Only the pages that apply to a release are generated for it, so a guide gated with `since`
		// simply does not exist under an older version rather than 404ing there.
		['', ...pagesFor(version.releaseVersion).map((page) => page.slug)].map((slug) => ({ version: version.id, slug }))
	);

export const load: PageLoad = async ({ params, parent }) => {
	const { version } = await parent();
	const slug = params.slug === '' ? docsConfig.landingSlug : params.slug;
	const page = findPage(slug, version.releaseVersion);

	// The component is a chunk of its own, fetched here for this page alone — see `pages.ts`.
	const component = page ? await loadPage(slug, version.releaseVersion) : undefined;

	if (!page || !component) {
		error(404, { message: `There is no documentation page at "${slug}" for ${version.label}.` });
	}

	return {
		version,
		page,
		component,
		chrome: {
			slug,
			title: page.title,
			section: page.slug.split('/').slice(0, -1).join(' / ') || 'Documentation',
			reference: false
		},
		...siblings(slug, version.releaseVersion)
	};
};
