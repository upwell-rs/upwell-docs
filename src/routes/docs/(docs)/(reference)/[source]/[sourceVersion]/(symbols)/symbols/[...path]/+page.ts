import { docsContent } from '#lib/docs/runtime';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data }) => ({
	...data,
	component: data.kind === 'authored' ? await docsContent.loadSymbolPage(data.page.segments, data.version.releaseVersion) : undefined
});
