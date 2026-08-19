import { error } from '@sveltejs/kit';
import { frameworkCrate } from '@upwell/docs-core/config';
import { docsSources } from '#lib/docs/runtime.server';
import type { PageMetadata } from '#lib/docs/site/metadata';
import { docsConfig } from 'virtual:docs-config';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = async ({ params, parent, setHeaders, url }) => {
	const { source: sourceData, version } = await parent();
	const source = frameworkCrate(docsConfig, sourceData.crate);

	if (!source) {
		error(404, 'Unknown documentation source or version.');
	}

	const file = await docsSources.loadFile(source, version, params.path);

	if (!file) {
		error(404, 'Source file not found.');
	}

	setHeaders({ 'cache-control': 'public, max-age=0, must-revalidate' });

	const metadata: PageMetadata = {
		title: `${file.path || source.crate} source`,
		description: `Browse ${file.path || source.crate} from ${source.crate} ${version.label}.`,
		path: url.pathname,
		version: version.label
	};

	return {
		file,
		metadata,
		chrome: { slug: file.path ? `src/${file.path}` : 'src/', title: file.path.split('/').pop() || 'Source', section: 'Source', reference: true as const }
	};
};
