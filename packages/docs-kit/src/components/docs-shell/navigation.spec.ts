import { describe, expect, it, vi } from 'vitest';

import type { DocsConfig, DocsSource, DocsVersion, FrameworkCrateCoordinates } from '@upwell/docs-core/config';
import { parseVersion, versionId } from '@upwell/docs-core/semver';

import type { DocsContent } from '../../content.ts';
import { resolveAuthoringReferenceTarget, resolveVersionNavigationTarget } from './navigation.ts';

const rootV1 = version('root-v1', '1.0.0');
const rootV2 = version('root-v2', '2.0.0');
const extraV1 = version('extra-v1', '1.0.0');
const extraLatest = version('extra-latest', '9.0.0');
const root = source('framework', [rootV1, rootV2], rootV2);
const extra = source('framework-extra', [extraV1, extraLatest], extraLatest);
const config = {
	framework: { name: 'Framework', root, crates: [extra] },
	cacheDir: '.cache',
	landingSlug: 'getting-started',
	topics: [],
	rustdoc: { directDependencyCrates: [], standardLibraryCrates: [] }
} satisfies DocsConfig;

function version(id: string, release: string): DocsVersion {
	return {
		id: versionId(id),
		label: release,
		releaseVersion: parseVersion(release, 'Test version')
	};
}

function source(
	crate: string,
	versions: readonly DocsVersion[],
	latest: DocsVersion
): FrameworkCrateCoordinates {
	return {
		crate,
		repository: `https://example.test/${crate}`,
		versions,
		latest: latest.id,
		releaseTag: (release) => release
	};
}

function content(options: { guide?: boolean; symbol?: boolean } = {}): DocsContent {
	return {
		config,
		findPage: vi.fn(() => options.guide ? {} as never : undefined),
		findSymbolPage: vi.fn(() => options.symbol ? {} as never : undefined),
		pageHref: (release: string, slug: string) => `/docs/${release}/${slug}`,
		symbolHref: (crate: string, release: string, path: string) => `/docs/${crate}/${release}/symbols/${path}`,
		sourceHref: (crate: string, release: string, path: string) => `/docs/${crate}/${release}/src/${path}`
	} as unknown as DocsContent;
}

function navigate(
	options: Partial<{
		content: DocsContent;
		activeSource: DocsSource;
		slug: string;
		versions: readonly DocsVersion[];
		targetVersionId: string;
	}> = {}
): string | undefined {
	return resolveVersionNavigationTarget({
		content: options.content ?? content(),
		activeSource: options.activeSource ?? root,
		slug: options.slug ?? 'guide',
		versions: options.versions ?? root.versions,
		targetVersionId: options.targetVersionId ?? rootV2.id
	});
}

describe('resolveVersionNavigationTarget', () => {
	it('ignores version ids outside the versions available to the active source', () => {
		expect(navigate({ targetVersionId: 'missing' })).toBeUndefined();
	});

	it('keeps an available guide and falls back to the configured landing guide when absent', () => {
		expect(navigate({ content: content({ guide: true }), slug: 'configuration' }))
			.toBe('/docs/root-v2/configuration');
		expect(navigate({ slug: 'retired-guide' })).toBe('/docs/root-v2/getting-started');
	});

	it('keeps the symbol index in the selected release', () => {
		expect(navigate({ slug: 'symbols' })).toBe('/docs/framework/root-v2/symbols/');
	});

	it('keeps an available root symbol and falls back to the root symbol index when absent', () => {
		expect(navigate({ content: content({ symbol: true }), slug: 'symbols/framework/App' }))
			.toBe('/docs/framework/root-v2/symbols/framework/App');
		expect(navigate({ slug: 'symbols/framework/Removed' }))
			.toBe('/docs/framework/root-v2/symbols/');
	});

	it('preserves custom-source symbol details without consulting the root content catalog', () => {
		const catalog = content();

		expect(navigate({
			content: catalog,
			activeSource: extra,
			slug: 'symbols/extra/Client',
			versions: extra.versions,
			targetVersionId: extraLatest.id
		})).toBe('/docs/framework-extra/extra-latest/symbols/extra/Client');
		expect(catalog.findSymbolPage).not.toHaveBeenCalled();
	});

	it('preserves source paths for root and custom sources', () => {
		expect(navigate({ slug: 'src/crates/app/src/lib.rs' }))
			.toBe('/docs/framework/root-v2/src/crates/app/src/lib.rs');
		expect(navigate({
			activeSource: extra,
			slug: 'src/src/lib.rs',
			versions: extra.versions,
			targetVersionId: extraLatest.id
		})).toBe('/docs/framework-extra/extra-latest/src/src/lib.rs');
	});
});

describe('resolveAuthoringReferenceTarget', () => {
	it('uses the active source release and an explicit configured release', () => {
		expect(resolveAuthoringReferenceTarget({
			config,
			activeSource: extra.crate,
			activeVersion: extraLatest
		})).toEqual({ source: root, version: rootV2 });
		expect(resolveAuthoringReferenceTarget({
			config,
			activeSource: root.crate,
			activeVersion: rootV2,
			source: extra.crate,
			version: extraV1.id
		})).toEqual({ source: extra, version: extraV1 });
	});

	it('matches a corresponding custom-source release, then falls back to its latest release', () => {
		expect(resolveAuthoringReferenceTarget({
			config,
			activeSource: root.crate,
			activeVersion: rootV1,
			source: extra.crate
		}).version).toBe(extraV1);
		expect(resolveAuthoringReferenceTarget({
			config,
			activeSource: root.crate,
			activeVersion: rootV2,
			source: extra.crate
		}).version).toBe(extraLatest);
	});

	it('rejects unknown sources and explicit versions with the existing diagnostic', () => {
		expect(() => resolveAuthoringReferenceTarget({
			config,
			activeSource: root.crate,
			activeVersion: rootV1,
			source: 'unknown'
		})).toThrow('Unknown documentation source or version: unknown.');
		expect(() => resolveAuthoringReferenceTarget({
			config,
			activeSource: root.crate,
			activeVersion: rootV1,
			source: extra.crate,
			version: 'missing'
		})).toThrow('Unknown documentation source or version: framework-extra@missing.');
	});
});
