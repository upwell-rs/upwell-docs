import { docsServerRoutes } from '#lib/docs/runtime.server';
import type { LayoutServerLoad } from './$types';

/** Shares the compact symbol catalog with both index and detail routes. */
export const load: LayoutServerLoad = async ({ parent }) => {
	const { source, version } = await parent();

	return {
		records: await docsServerRoutes.loadSymbolRecords(source, version),
		area: 'symbols' as const
	};
};
