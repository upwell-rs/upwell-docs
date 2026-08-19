import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import { docsSource, frameworkCrate, frameworkCrateVersion, resolvePrerender } from '@upwell/docs-core/config';
import { docsServerRoutes } from '#lib/docs/runtime.server';
import { docsConfig } from 'virtual:docs-config';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = resolvePrerender(docsConfig, 'symbols', dev);
export const entries: EntryGenerator = () => docsServerRoutes.symbolIndexEntries().map(({ source, version }) => ({ source, sourceVersion: version }));

export const GET: RequestHandler = async ({ params }) => {
	const source = frameworkCrate(docsConfig, params.source);
	const version = source ? frameworkCrateVersion(source, params.sourceVersion) : undefined;

	if (!source || !version) {
		error(404, 'Unknown documentation source or version.');
	}

	return json(await docsServerRoutes.loadSymbolRecords(docsSource(source), version));
};
