import { dev } from '$app/env';
import { redirect } from '@sveltejs/kit';
import { resolvePrerender } from '@upwell/docs-core/config';
import { docsConfig } from 'virtual:docs-config';
import type { PageLoad } from './$types';

export const prerender = resolvePrerender(docsConfig, 'redirects', dev);

export const load: PageLoad = ({ params }) => redirect(
	308,
	`/docs/${docsConfig.framework.root.crate}/${params.version}/symbols/${params.path}`
);
