import { describe, expect, it, vi } from 'vitest';

import type { DocsConfig, DocsVersion, FrameworkCrateCoordinates } from '@upwell/docs-core/config';
import { parseVersion, versionId } from '@upwell/docs-core/semver';

import type { DocsContent } from './content.ts';
import type { ArtifactService, SymbolCatalog } from './server/artifact.ts';
import { createDocsServerRouteHelpers } from './sveltekit-server.ts';

const version: DocsVersion = {
	id: versionId('v1'),
	label: '1.0.0',
	releaseVersion: parseVersion('1.0.0', 'Test version')
};

const source: FrameworkCrateCoordinates = {
	crate: 'framework',
	repository: 'https://example.test/framework',
	versions: [version],
	latest: version.id,
	releaseTag: (release) => release
};

const config = {
	framework: { name: 'Framework', root: source, crates: [] },
	cacheDir: '.cache',
	landingSlug: 'getting-started',
	topics: [],
	rustdoc: { directDependencyCrates: [], standardLibraryCrates: [] }
} satisfies DocsConfig;

const catalog = {
	records: [{
		source: source.crate,
		path: 'framework::Client',
		name: 'Client',
		crate: source.crate,
		kind: 'struct',
		summary: 'A client.',
		destination: { kind: 'generated', href: '/docs/framework/v1/symbols/framework/Client', segments: 'framework/Client' }
	}]
} as unknown as SymbolCatalog;

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(reason?: unknown): void } {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return { promise, resolve, reject };
}

function helpers(getCatalog: ArtifactService['getCatalog']) {
	const content = {
		config,
		symbolPagesFor: () => [],
		symbolHref: (crate: string, id: string, path: string) => `/docs/${crate}/${id}/symbols/${path}`
	} as unknown as DocsContent;
	const artifacts = { getCatalog } as ArtifactService;

	return createDocsServerRouteHelpers({
		content,
		artifacts,
		error: (status, body) => { throw new Error(`${status}: ${body.message}`); },
		building: false,
		buildSearchIndex: vi.fn()
	});
}

describe('createDocsServerRouteHelpers symbol record cache', () => {
	it('coalesces concurrent shared layout record requests and reuses successful records', async () => {
		const loading = deferred<SymbolCatalog | null>();
		const getCatalog = vi.fn(() => loading.promise);
		const routes = helpers(getCatalog);

		const first = routes.loadSymbolRecords(source, version);
		const second = routes.loadSymbolRecords(source, version);

		expect(getCatalog).toHaveBeenCalledTimes(1);

		loading.resolve(catalog);

		const [firstResult, secondResult] = await Promise.all([first, second]);
		expect(firstResult).toBe(secondResult);

		await routes.loadSymbolRecords(source, version);
		expect(getCatalog).toHaveBeenCalledTimes(1);
	});

	it('evicts a failed symbol record request so the next request retries', async () => {
		const getCatalog = vi.fn()
			.mockRejectedValueOnce(new Error('temporary artifact failure'))
			.mockResolvedValueOnce(catalog);
		const routes = helpers(getCatalog);

		await expect(routes.loadSymbolRecords(source, version)).rejects.toThrow('temporary artifact failure');

		const result = await routes.loadSymbolRecords(source, version);
		expect(result).toEqual([{
			path: 'framework::Client',
			name: 'Client',
			crate: source.crate,
			kind: 'struct',
			summary: 'A client.',
			href: '/docs/framework/v1/symbols/framework/Client',
			authored: false
		}]);
		expect(getCatalog).toHaveBeenCalledTimes(2);
	});
});
