import { error } from '@sveltejs/kit';
import { docsSource, frameworkCrate, frameworkCrateVersion } from '@upwell/docs-core/config';
import { docsSources } from '#lib/docs/runtime.server';
import { docsConfig } from 'virtual:docs-config';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = async ({ params, setHeaders }) => {
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

	return {
		source: docsSource(source),
		version,
		versions: source.versions,
		file,
		chrome: { slug: file.path ? `src/${file.path}` : 'src/', title: file.path.split('/').pop() || 'Source', section: 'Source', reference: true as const }
	};
};
