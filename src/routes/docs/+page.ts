/**
 * `/docs` resolves to an explicit release.
 *
 * The redirect target is the configured latest version's id, never the string `latest`: a generated
 * build must name the release it documents, so that a bookmarked or shared URL keeps meaning the
 * same thing after the next release.
 */

import { redirect } from '@sveltejs/kit';

import { docsConfig, latestVersion } from '#lib/docs/config';
import type { PageLoad } from './$types';

export const prerender = true;

export const load: PageLoad = () => {
	redirect(307, `/docs/${latestVersion(docsConfig).id}/${docsConfig.landingSlug}`);
};
