/** What a crawler may fetch, and where the map of it is. */

import { robots } from '#lib/docs/discovery.server';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () =>
	new Response(robots(), {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' }
	});
