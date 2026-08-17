/**
 * The site root is the documentation.
 *
 * There is no separate landing page: this site exists to document one framework, so a page whose
 * only content is a link to the documentation is a step the reader has to take for nothing.
 *
 * Resolves to an explicit release rather than serving under `/`, so the URL a reader ends up on —
 * and shares — always names the version they are reading.
 */

import { redirect } from '@sveltejs/kit';

import { latestVersion } from '#lib/docs/config';
import { docsConfig } from 'virtual:docs-config';
import type { PageLoad } from './$types';

export const prerender = true;

export const load: PageLoad = () => {
	redirect(307, `/docs/${latestVersion(docsConfig).id}/${docsConfig.landingSlug}`);
};
