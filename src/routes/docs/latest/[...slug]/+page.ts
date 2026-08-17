import { redirect } from '@sveltejs/kit';

import { docsConfig, latestVersion } from '#lib/docs/config';
import { pagesFor } from '#lib/docs/content/pages';
import { symbolPagesFor } from '#lib/docs/content/symbol-pages';
import type { EntryGenerator, PageLoad } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => {
	const version = latestVersion(docsConfig);

	return [
		{ slug: '' },
		...pagesFor(version.releaseVersion).map((page) => ({ slug: page.slug })),
		...symbolPagesFor(version.releaseVersion).map((page) => ({ slug: `symbols/${page.segments}` }))
	];
};

/** `latest` is a stable redirect alias; all rendered and shared URLs use the explicit release. */
export const load: PageLoad = ({ params }) => {
	const version = latestVersion(docsConfig);
	const slug = params.slug || docsConfig.landingSlug;

	redirect(308, `/docs/${version.id}/${slug}`);
};
