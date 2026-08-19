import { dev } from '$app/env';
import { resolvePrerender } from '@upwell/docs-core/config';
import { docsServerRoutes } from '#lib/docs/runtime.server';
import type { PageMetadata } from '#lib/docs/site/metadata';
import { docsConfig } from 'virtual:docs-config';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = resolvePrerender(docsConfig, 'symbols', dev);
export const entries: EntryGenerator = () => [...docsServerRoutes.symbolIndexEntries()].map(({ source, version }) => ({ source, sourceVersion: version }));

export const load: PageServerLoad = async ({ parent, url }) => {
	const { source, version } = await parent();
	const { sources } = docsServerRoutes.loadSymbolSources();
	const metadata: PageMetadata = {
		title: `${source.crate} symbols`,
		description: `Browse documented symbols for ${source.crate} ${version.label}.`,
		path: url.pathname,
		version: version.label
	};

	return { sources, chrome: { slug: 'symbols' as const, title: 'Symbols', section: 'Symbols', reference: true as const }, metadata };
};
