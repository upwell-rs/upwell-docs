/**
 * The site index written for a language model rather than for a crawler.
 *
 * `llms.txt` is a short, linked table of contents: one line per guide, pointing at the Markdown copy
 * instead of at the page, so a reader gets the prose and the code without the application around it.
 */

import { llms } from '#lib/docs/discovery.server';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () =>
	new Response(llms(), {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' }
	});
