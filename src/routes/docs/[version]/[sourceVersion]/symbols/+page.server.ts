import { dev } from '$app/env';
import { resolvePrerender } from '@upwell/docs-core/config';
import { docsServerRoutes } from '#lib/docs/runtime.server';
import type { PageMetadata } from '#lib/docs/site/metadata';
import { docsConfig } from 'virtual:docs-config';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = resolvePrerender(docsConfig, 'symbols', dev);
export const entries: EntryGenerator = () => [...docsServerRoutes.symbolIndexEntries()].map(({ source, version }) => ({ version: source, sourceVersion: version }));

export const load: PageServerLoad = async ({ params, url }) => {
	const data = await docsServerRoutes.loadSymbolsIndex(params.version, params.sourceVersion);
	const metadata: PageMetadata = {
		title: `${data.source.crate} symbols`,
		description: `Browse documented symbols for ${data.source.crate} ${data.version.label}.`,
		path: url.pathname,
		version: data.version.label
	};

	return { ...data, metadata };
};
