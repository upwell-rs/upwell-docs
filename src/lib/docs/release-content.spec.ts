import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createDocsContent } from '@upwell/docs-kit/content';
import { createSearchIndexService } from '@upwell/docs-kit/server';
import { createDocsRouteHelpers } from '@upwell/docs-kit/sveltekit';
import { readManifest } from '@upwell/docs-vite';

import { docsConfig } from '../../../docs.config.ts';
import { guideRedirects } from './guide-redirects.ts';

const historicalSlugs = ['application-model', 'components', 'http-controllers', 'native-daemon-rpc'];
const fixtureSlugs = ['framework/new-runtime', 'path-version-selectors'];
const groupLandingSlugs = [
	'framework',
	'framework/application',
	'framework/dependency-injection',
	'framework/configuration',
	'framework/platforms',
	'framework/extensions',
	'axum',
	'axum/http',
	'axum/websocket',
	'rpc',
	'rpc/server',
	'clients',
	'clients/native',
	'clients/browser',
	'cargo-upwell',
	'cargo-upwell/cli',
	'cargo-upwell/programmatic-api',
	'cargo-upwell/catalog',
	'cargo-upwell/renderers'
];

async function catalog() {
	const manifest = await readManifest(path.resolve(import.meta.dirname, '../../..'));
	const component = () => ({});
	const guideModules = Object.fromEntries(manifest.guides.map((entry) => [entry.file, async () => ({ default: component })]));

	return createDocsContent({
		config: docsConfig,
		manifest: { guides: manifest.guides, symbols: manifest.symbols },
		guideModules,
		symbolModules: {},
		basePath: '/docs'
	});
}

function navigationPageIds(nodes: ReturnType<Awaited<ReturnType<typeof catalog>>['navigationFor']>): string[] {
	return nodes.flatMap((node) => [
		...(node.type === 'page' ? [node.id] : node.pageId ? [node.pageId] : []),
		...(node.type === 'group' ? navigationPageIds(node.children) : [])
	]);
}

describe('release content visibility', () => {
	it('publishes every nested group landing and resolves authored guide references', async () => {
		const content = await catalog();
		const version = docsConfig.framework.root.versions.find((entry) => entry.releaseVersion.raw === '1.0.0')!;

		for (const slug of groupLandingSlugs) {
			expect(content.findPage(slug, version.releaseVersion), slug).toBeDefined();
		}

		for (const target of Object.values(guideRedirects)) {
			expect(content.findPage(target, version.releaseVersion), target).toBeDefined();
		}

		for (const page of content.pagesFor(version.releaseVersion)) {
			const source = content.pageSource(page.slug, version.releaseVersion);

			if (!source) continue;

			const contents = await readFile(path.resolve(import.meta.dirname, '../../..', source.slice(1)), 'utf8');
			const references = [...contents.matchAll(/<GuideRef\s+[^>]*slug="([^"]+)"/g)].map((match) => match[1]);

			for (const reference of references) {
				expect(content.findPage(reference, version.releaseVersion), `${page.slug} -> ${reference}`).toBeDefined();
			}
		}
	});

	it('keeps the historical guides in 0.20 and removes them from 1.0 navigation', async () => {
		const content = await catalog();
		const oldRelease = docsConfig.framework.root.versions.find((version) => version.releaseVersion.raw === '0.20.0')!;
		const currentRelease = docsConfig.framework.root.versions.find((version) => version.releaseVersion.raw === '1.0.0')!;
		const oldPages = content.pagesFor(oldRelease.releaseVersion).map((page) => page.slug);
		const currentPages = content.pagesFor(currentRelease.releaseVersion).map((page) => page.slug);
		const currentNavigation = navigationPageIds(content.navigationFor(currentRelease));

		expect(oldPages).toEqual(expect.arrayContaining(historicalSlugs));

		for (const slug of historicalSlugs) {
			expect(currentPages).not.toContain(slug);
			expect(currentNavigation).not.toContain(slug);
		}
	});

	it('keeps fixture routes available while excluding drafts from public navigation and search', async () => {
		const content = await catalog();
		const version = docsConfig.framework.root.versions.find((entry) => entry.releaseVersion.raw === '1.0.0')!;
		const routes = createDocsRouteHelpers({
			content,
			error: (_status, body) => {
				throw new Error(body.message);
			}
		});
		const search = createSearchIndexService({
			content,
			documents: () => [],
			getCatalog: async () => null
		});
		const navigation = navigationPageIds(content.navigationFor(version));
		const searchHrefs = (await search.build(version)).records.map((record) => record.href);

		vi.doMock('./runtime.ts', () => ({ docsContent: content, docsRoutes: routes }));
		vi.doMock('./runtime.server.ts', () => ({
			docsServerRoutes: {
				symbolIndexEntries: () => [{ source: 'upwell', version: version.id }],
				symbolEntries: async () => [{ source: 'upwell', version: version.id, path: 'AppRuntime' }]
			}
		}));
		vi.doMock('./site.ts', () => ({ siteOrigin: 'https://docs.example.com' }));

		const { guideMarkdownEntries, sitemapExclusions, sitemapParamValues } = await import('./discovery.server.ts');
		const sitemapParams = await sitemapParamValues();
		const sitemapGuides = sitemapParams['/docs/[version]/[...slug]'];
		const markdownEntries = guideMarkdownEntries();

		expect(sitemapParams).toMatchObject({
			'/docs/[source]/[sourceVersion]/symbols': [['upwell', version.id]],
			'/docs/[source]/[sourceVersion]/symbols/[...path]': [['upwell', version.id, 'AppRuntime']]
		});
		expect(sitemapParams).not.toHaveProperty('/docs/[version]/[sourceVersion]/symbols');
		expect(sitemapParams).not.toHaveProperty('/docs/[version]/[sourceVersion]/symbols/[...path]');
		expect(sitemapExclusions.some((pattern) => pattern.test('/docs/[source]/[sourceVersion]/src/lib.rs'))).toBe(true);
		expect(sitemapExclusions.some((pattern) => pattern.test('/docs/[version]/[sourceVersion]/src/lib.rs'))).toBe(false);

		for (const slug of fixtureSlugs) {
			expect(content.findPage(slug, version.releaseVersion)?.draft).toBe(true);
			expect(routes.guideEntries()).toContainEqual({ version: version.id, slug });
			expect((await routes.loadGuide({ slug }, version)).page.slug).toBe(slug);
			expect(navigation).not.toContain(slug);
			expect(searchHrefs).not.toContain(content.pageHref(version.id, slug));
			expect(sitemapGuides).not.toContainEqual([version.id, slug]);
			expect(markdownEntries).not.toContainEqual({ version: version.id, slug: `${slug}.md` });
		}
	});
});
