/**
 * Every canonical page of every documented release.
 *
 * `super-sitemap` derives the route list from the routes on disk and fails the build while any
 * parameterized route has neither values nor an exclusion. That is the property worth a dependency
 * here: this site has several route families, and a hand-written enumeration omits a new one in
 * silence — a sitemap that looks complete and is not.
 *
 * Prerendered, which is why the origin is a build input: a file written at build time cannot ask a
 * request what host it belongs to.
 */

import { response } from 'super-sitemap/sveltekit';
import { sitemapExclusions, sitemapParamValues } from '#lib/docs/discovery.server';
import { siteOrigin } from '#lib/docs/site';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = async () =>
	response({
		origin: siteOrigin,
		excludeRoutePatterns: [...sitemapExclusions],
		paramValues: await sitemapParamValues()
	});
