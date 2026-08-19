import { error } from '@sveltejs/kit';
import { docsSource, frameworkCrate, frameworkCrateVersion } from '@upwell/docs-core/config';
import { docsConfig } from 'virtual:docs-config';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ params }) => {
	const source = frameworkCrate(docsConfig, params.source);
	const version = source ? frameworkCrateVersion(source, params.sourceVersion) : undefined;

	if (!source || !version) {
		error(404, 'Unknown documentation source or version.');
	}

	return { source: docsSource(source), version, versions: source.versions };
};
