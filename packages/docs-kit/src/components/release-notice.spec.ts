import { describe, expect, it } from 'vitest';

import type { DocsVersion, FrameworkCrateCoordinates } from '@upwell/docs-core/config';
import { tryParseExactVersion, versionId } from '@upwell/docs-core/semver';

import type { DocsContent } from '../content.ts';
import { resolveReleaseNotice } from './release-notice.ts';

const oldVersion = version('v1', '1.0.0', '1.0');
const latestVersion = version('v2', '2.0.0', '2.0');
const source = {
	crate: 'framework',
	repository: 'https://example.test/framework',
	versions: [oldVersion, latestVersion],
	latest: latestVersion.id,
	releaseTag: (release: string) => `v${release}`
} satisfies FrameworkCrateCoordinates;

function version(id: string, release: string, label: string): DocsVersion {
	const releaseVersion = tryParseExactVersion(release);

	if (!releaseVersion) {
		throw new Error(`Invalid fixture release: ${release}`);
	}

	return { id: versionId(id), releaseVersion, label };
}

function content(options: { guide?: boolean; symbol?: boolean } = {}): DocsContent {
	return {
		config: {
			framework: { name: 'Framework', root: source, crates: [] },
			landingSlug: 'getting-started'
		} as unknown as DocsContent['config'],
		findPage: () => options.guide ? {} as never : undefined,
		findSymbolPage: () => options.symbol ? {} as never : undefined,
		pageHref: (versionId: string, slug: string) => `/docs/${versionId}/${slug}`,
		symbolHref: (sourceId: string, versionId: string, path: string) => `/docs/${sourceId}/${versionId}/symbols/${path}`,
		sourceHref: (sourceId: string, versionId: string, path: string) => `/docs/${sourceId}/${versionId}/src/${path}`
	} as unknown as DocsContent;
}

describe('resolveReleaseNotice', () => {
	it('does not return a notice for the configured latest release', () => {
		expect(resolveReleaseNotice({ content: content(), version: latestVersion, source, slug: 'guide' })).toBeUndefined();
	});

	it('links an available guide to the equivalent latest page', () => {
		expect(resolveReleaseNotice({ content: content({ guide: true }), version: oldVersion, source, slug: 'guide' })?.href)
			.toBe('/docs/v2/guide');
	});

	it('falls back to the latest landing page when a guide is unavailable', () => {
		expect(resolveReleaseNotice({ content: content(), version: oldVersion, source, slug: 'retired-guide' })?.href)
			.toBe('/docs/v2/getting-started');
	});

	it('links an available symbol to the equivalent latest page', () => {
		expect(resolveReleaseNotice({ content: content({ symbol: true }), version: oldVersion, source, slug: 'symbols/framework/Service' })?.href)
			.toBe('/docs/framework/v2/symbols/framework/Service');
	});

	it('falls back to the latest symbol index when a symbol is unavailable', () => {
		expect(resolveReleaseNotice({ content: content(), version: oldVersion, source, slug: 'symbols/framework/Removed' })?.href)
			.toBe('/docs/framework/v2/symbols');
	});

	it('uses the latest source root when a historical path may be absent', () => {
		expect(resolveReleaseNotice({
			content: content(),
			version: oldVersion,
			source,
			slug: 'src/crates/removed-in-v2/src/legacy.rs'
		})?.href).toBe('/docs/framework/v2/src/');
	});
});
