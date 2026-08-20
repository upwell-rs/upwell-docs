/**
 * Resolves one authored page within a documented release.
 *
 * `entries` is what makes prerendering enumerate the site: a catch-all route has no discoverable
 * URLs, so every (version, slug) pair is listed from the content index. The empty slug is included
 * so `/docs/<version>` serves the landing page.
 */

import { docsContent, docsRoutes } from '#lib/docs/runtime';
import { guideRedirects } from '#lib/docs/guide-redirects';
import type { PageMetadata } from '#lib/docs/site/metadata';
import { redirect } from '@sveltejs/kit';
import { docsConfig } from 'virtual:docs-config';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => {
	return [...docsRoutes.guideEntries()];
};

export const load: PageLoad = async ({ params, parent, url }) => {
	const { version } = await parent();
	const target = guideRedirects[params.slug];

	if (target && docsContent.findPage(target, version.releaseVersion)) {
		redirect(308, docsContent.pageHref(version.id, target));
	}

	const data = await docsRoutes.loadGuide(params, version);
	const metadata: PageMetadata = {
		title: data.page.title,
		description: data.page.description ?? `${data.page.title} in the ${docsConfig.framework.name} ${data.version.label} documentation.`,
		path: url.pathname,
		version: data.version.label
	};

	return { ...data, metadata };
};
