import { expect, test } from '@playwright/test';

import { docsConfig } from '../../docs.config.ts';
import { latestVersion } from '@upwell/docs-core/config';

/**
 * The files other machines read: `robots.txt`, `sitemap.xml`, `llms.txt`, and a Markdown copy of every
 * guide.
 *
 * Checked end to end rather than as builders, because the part that breaks is not the rendering — it
 * is whether the build wrote the file at all, and whether the origin baked into it is the one the site
 * is served from.
 */
const VERSION = latestVersion(docsConfig).id;
const ORIGIN = 'http://localhost:4173';

test('robots.txt names the sitemap at the built origin', async ({ request }) => {
	const response = await request.get('/robots.txt');

	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('text/plain');

	const body = await response.text();

	expect(body).toContain('User-agent: *');
	expect(body).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
	// The JSON the application fetches for itself is data, not pages.
	expect(body).toContain('Disallow: /docs/*/search.json');
});

test('the sitemap lists guides and reference pages, and leaves redirects out', async ({ request }) => {
	const response = await request.get('/sitemap.xml');

	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('xml');

	const body = await response.text();

	expect(body).toContain(`<loc>${ORIGIN}/docs/${VERSION}/${docsConfig.landingSlug}</loc>`);
	expect(body).toContain(`<loc>${ORIGIN}/docs/upwell/${VERSION}/symbols</loc>`);
	expect(body).toContain(`<loc>${ORIGIN}/docs/upwell/${VERSION}/symbols/upwell_macros/component</loc>`);

	// `/docs/latest/…` and `/docs` send a reader elsewhere; the sitemap names where they end up.
	expect(body).not.toContain(`<loc>${ORIGIN}/docs/latest`);
	expect(body).not.toContain(`<loc>${ORIGIN}/docs</loc>`);
});

test('llms.txt indexes every guide by its Markdown copy', async ({ request }) => {
	const response = await request.get('/llms.txt');

	expect(response.status()).toBe(200);

	const body = await response.text();

	expect(body).toContain(`# ${docsConfig.framework.name} documentation`);
	expect(body).toContain(`- [Getting started](${ORIGIN}/llms/${VERSION}/${docsConfig.landingSlug}.md)`);
	expect(body).toContain('## Reference');
});

test('a guide has a Markdown copy with its code and without its components', async ({ request }) => {
	const response = await request.get(`/llms/${VERSION}/${docsConfig.landingSlug}.md`);

	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('text/markdown');

	const body = await response.text();

	expect(body.startsWith('# Getting started')).toBe(true);
	// The code blocks are the reason this exists; the Svelte layer is the reason it is not the page.
	expect(body).toContain('```sh');
	expect(body).toContain('cargo add upwell --features axum');
	expect(body).not.toContain('<script');
	expect(body).not.toContain('<Example');
	expect(body).not.toContain('---\ntitle:');
});

test('a Markdown copy of a page that does not exist is a 404', async ({ request }) => {
	const response = await request.get(`/llms/${VERSION}/nothing-here.md`);

	expect(response.status()).toBe(404);
});
