import type { Handle } from '@sveltejs/kit';
import { latestVersion } from '@upwell/docs-core/config';

import { docsConfig } from '../docs.config.ts';
import { guideRedirects } from '#lib/docs/guide-redirects';

export const handle: Handle = ({ event, resolve }) => {
	const match = /^\/docs\/([^/]+)\/(.+)$/.exec(event.url.pathname);
	const target = match ? guideRedirects[match[2]] : undefined;

	if (match && target) {
		const requestedVersion = match[1];
		const version = requestedVersion === 'latest' ? latestVersion(docsConfig).id : requestedVersion;
		const documented = docsConfig.framework.root.versions.some((entry) => entry.id === version);

		if (documented) {
			return new Response(null, {
				status: 308,
				headers: { location: `/docs/${version}/${target}${event.url.search}` }
			});
		}
	}

	return resolve(event);
};
