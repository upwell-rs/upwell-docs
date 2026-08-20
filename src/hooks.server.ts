import type { RequestEvent } from '@sveltejs/kit';
import { resolveVersion } from '@upwell/docs-core/config';

import { docsConfig } from '../docs.config.ts';
import { guideRedirects } from '#lib/docs/guide-redirects';
import { docsContent } from '#lib/docs/runtime';

interface HandleEvent {
	event: RequestEvent;
	resolve: (event: RequestEvent) => MaybePromise<Response>;
}

type MaybePromise<T> = T | Promise<T>;

export const handle = ({ event, resolve }: HandleEvent): MaybePromise<Response> => {
	const match = /^\/docs\/([^/]+)\/(.+)$/.exec(event.url.pathname);
	const target = match ? guideRedirects[match[2]] : undefined;

	if (match && target) {
		const version = resolveVersion(docsConfig, match[1]);

		if (version && docsContent.findPage(target, version.releaseVersion)) {
			return new Response(null, {
				status: 308,
				headers: { location: `/docs/${version.id}/${target}${event.url.search}` }
			});
		}
	}

	return resolve(event);
};
