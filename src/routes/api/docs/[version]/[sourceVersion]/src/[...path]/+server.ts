import { error, json } from '@sveltejs/kit';
import { frameworkCrate, frameworkCrateVersion } from '@upwell/docs-core/config';
import { docsSources } from '#lib/docs/runtime.server';
import { docsConfig } from 'virtual:docs-config';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const source = frameworkCrate(docsConfig, params.version);
	const version = source ? frameworkCrateVersion(source, params.sourceVersion) : undefined;

	if (!source || !version) {
		error(404, 'Unknown documentation source or version.');
	}

	const file = await docsSources.loadFile(source, version, params.path);

	if (!file) {
		error(404, 'Source file not found.');
	}

	setHeaders({ 'cache-control': 'public, max-age=0, must-revalidate' });

	return json(file);
};
