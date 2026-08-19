import { dev } from '$app/env';
import { resolvePrerender } from '@upwell/docs-core/config';
import { docsServerRoutes } from '#lib/docs/runtime.server';
import type { PageMetadata } from '#lib/docs/site/metadata';
import { docsConfig } from 'virtual:docs-config';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = resolvePrerender(docsConfig, 'symbols', dev);
export const entries: EntryGenerator = () => docsServerRoutes.symbolEntries().then((entries) =>
	entries.map(({ source, version, path }) => ({ source, sourceVersion: version, path }))
);

export const load: PageServerLoad = async ({ params, parent, url }) => {
	const { source, version } = await parent();
	const data = await docsServerRoutes.loadSymbol({
		source,
		version,
		path: params.path
	});
	const metadata: PageMetadata = {
		title: data.page.symbol,
		description: data.page.description || data.symbol.doc || `API reference for ${data.page.symbol} in ${docsConfig.framework.name} ${data.version.label}.`,
		path: url.pathname,
		version: data.version.label
	};

	return { ...data, metadata };
};
