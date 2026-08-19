import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ parent }) => {
	const { source, version } = await parent();

	return { area: 'source' as const, source, version };
};
