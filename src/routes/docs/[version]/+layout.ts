/**
 * Documentation routes are prerendered.
 *
 * The adapter is left alone — `adapter-node` still serves the app — but every documentation page is
 * static output, which is what makes the symbol metadata baked into each page free at request time.
 *
 * An unknown version segment is a 404 rather than a redirect to the latest release: silently showing
 * someone 0.20 documentation when they asked for 0.14 is worse than telling them it is not here.
 */

import { error } from '@sveltejs/kit';

import { docsConfig, resolveVersion } from '#lib/docs/config';
import type { LayoutLoad } from './$types';

export const prerender = true;

export const load: LayoutLoad = ({ params }) => {
	const version = resolveVersion(docsConfig, params.version);

	if (!version) {
		error(404, {
			message: `There is no documentation for version "${params.version}". Documented releases: ${docsConfig.versions.map((entry) => entry.id).join(', ')}.`
		});
	}

	return { version };
};
