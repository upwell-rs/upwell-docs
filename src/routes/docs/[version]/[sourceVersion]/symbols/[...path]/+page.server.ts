import { dev } from '$app/env';
import { resolvePrerender } from '@upwell/docs-core/config';
import { docsServerRoutes } from '#lib/docs/runtime.server';
import { docsConfig } from 'virtual:docs-config';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = resolvePrerender(docsConfig, 'symbols', dev);
export const entries: EntryGenerator = () => docsServerRoutes.symbolEntries().then((entries) =>
	entries.map(({ source, version, path }) => ({ version: source, sourceVersion: version, path }))
);

export const load: PageServerLoad = ({ params }) => docsServerRoutes.loadSymbol({
	source: params.version,
	version: params.sourceVersion,
	path: params.path
});
