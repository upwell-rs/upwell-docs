/**
 * `/docs` resolves to an explicit release.
 *
 * The redirect target is the configured latest version's id, never the string `latest`: a generated
 * build must name the release it documents, so that a bookmarked or shared URL keeps meaning the
 * same thing after the next release.
 */

import { dev } from '$app/env';
import { redirect } from '@sveltejs/kit';
import { resolvePrerender } from '@upwell/docs-core/config';

import { docsRoutes } from '#lib/docs/runtime';
import { docsConfig } from 'virtual:docs-config';
import type { PageLoad } from './$types';

export const prerender = resolvePrerender(docsConfig, 'redirects', dev);

export const load: PageLoad = () => redirect(307, docsRoutes.latestTarget(''));
