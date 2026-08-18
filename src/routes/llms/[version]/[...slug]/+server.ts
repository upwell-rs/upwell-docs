/**
 * One guide as Markdown.
 *
 * The same content the page renders, with its Svelte layer removed: prose, headings, and code blocks,
 * which is everything a reader that is not a browser can use. Prerendered alongside the pages, so
 * every one of these is a file rather than a render.
 */

import { error } from '@sveltejs/kit';
import { guideMarkdown, guideMarkdownEntries } from '#lib/docs/discovery.server';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => guideMarkdownEntries().map((entry) => ({ version: entry.version, slug: entry.slug }));

export const GET: RequestHandler = async ({ params }) => {
	const markdown = await guideMarkdown(params.version, params.slug);

	if (!markdown) {
		error(404, `There is no documentation page at "${params.slug}" for version "${params.version}".`);
	}

	return new Response(markdown, {
		headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' }
	});
};
