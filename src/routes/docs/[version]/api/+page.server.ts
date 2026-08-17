import { docsServerRoutes } from '#lib/docs/runtime.server';
import type { PageServerLoad } from './$types';

export const prerender = true;

export const load: PageServerLoad = ({ params }) => docsServerRoutes.loadApiIndex(params.version);
