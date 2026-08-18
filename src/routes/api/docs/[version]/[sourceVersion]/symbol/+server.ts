import { error, json } from '@sveltejs/kit';
import { frameworkCrate, frameworkCrateVersion } from '@upwell/docs-core/config';
import { docsSources } from '#lib/docs/runtime.server';
import { docsConfig } from 'virtual:docs-config';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, setHeaders }) => {
	const source = frameworkCrate(docsConfig, params.version);
	const version = source ? frameworkCrateVersion(source, params.sourceVersion) : undefined;
	const path = url.searchParams.get('path');

	if (!source || !version || !path) {
		error(404, 'Unknown documentation symbol.');
	}

	const symbol = await docsSources.loadSymbol(source, version, path);

	if (!symbol) {
		error(404, 'Symbol not found.');
	}

	setHeaders({ 'cache-control': 'public, max-age=0, must-revalidate' });

	return json(symbol);
};
