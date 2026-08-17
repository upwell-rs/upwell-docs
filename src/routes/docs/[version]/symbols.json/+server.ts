import { dev } from '$app/env';
import { json } from '@sveltejs/kit';
import { resolvePrerender } from '@upwell/docs-core/config';
import { docsServerRoutes } from '#lib/docs/runtime.server';
import { docsConfig } from 'virtual:docs-config';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = resolvePrerender(docsConfig, 'symbols', dev);

export const entries: EntryGenerator = () => [...docsServerRoutes.symbolIndexEntries()];

export const GET: RequestHandler = async ({ params }) => {
	const data = await docsServerRoutes.loadSymbolsIndex(params.version);

	return json(data.records);
};
