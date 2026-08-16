/**
 * Fetches the compiled markup for a symbol page.
 *
 * The facts about the symbol come from the server load beside this, which reads the artifact; the
 * component is a client-side chunk of its own, so it is imported here rather than in the component
 * file. Doing it in `load` means the page is resolved before it renders, which is what prerendering
 * needs — a component awaited during render would prerender as empty.
 */

import { loadSymbolPage } from '#lib/docs/content/symbol-pages';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data }) => {
	// `data` is what the server load beside this returned; `parent()` would give the layout's, which
	// knows the release but not which symbol page was resolved. It is spread through because a
	// universal load's return *is* the page's data — it does not merge with the server's by itself.
	return { ...data, component: await loadSymbolPage(data.page.segments, data.version.frameworkVersion) };
};
