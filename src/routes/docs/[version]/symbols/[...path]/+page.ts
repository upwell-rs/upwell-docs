/**
 * Fetches the compiled markup for a symbol page.
 *
 * The facts about the symbol come from the server load beside this, which reads the artifact; the
 * component is a client-side chunk of its own, so it is imported here rather than in the component
 * file. Doing it in `load` means the page is resolved before it renders, which is what prerendering
 * needs — a component awaited during render would prerender as empty.
 */

import { docsContent } from '#lib/docs/runtime';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data }) => ({
	...data,
	component: await docsContent.loadSymbolPage(data.page.segments, data.version.releaseVersion)
});
