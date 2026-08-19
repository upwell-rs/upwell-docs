/**
 * Resolves one authored page within a documented release.
 *
 * `entries` is what makes prerendering enumerate the site: a catch-all route has no discoverable
 * URLs, so every (version, slug) pair is listed from the content index. The empty slug is included
 * so `/docs/<version>` serves the landing page.
 */

import { docsRoutes } from '#lib/docs/runtime';
import type { PageMetadata } from '#lib/docs/site/metadata';
import { docsConfig } from 'virtual:docs-config';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => [...docsRoutes.guideEntries()];

export const load: PageLoad = async ({ params, parent, url }) => {
	const data = await docsRoutes.loadGuide(params, (await parent()).version);
	const metadata: PageMetadata = {
		title: data.page.title,
		description: data.page.description ?? `${data.page.title} in the ${docsConfig.framework.name} ${data.version.label} documentation.`,
		path: url.pathname,
		version: data.version.label
	};

	return { ...data, metadata };
};
