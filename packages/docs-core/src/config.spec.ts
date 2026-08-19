import { describe, expect, it } from 'vitest';

import {
	frameworkCrateVersion,
	frameworkCrates,
	resolveFrameworkReferenceVersion,
	resolvePrerender,
	resolveSymbolPagesConfig,
	type DocsConfig,
	type RustdocEnrichmentConfig
} from './config.ts';
import { parseVersion } from './semver.ts';

const config = (prerender?: DocsConfig['prerender']): DocsConfig => ({
	framework: {
		name: 'Test',
		root: { crate: 'test', repository: '', versions: [], latest: '' as DocsConfig['framework']['root']['latest'], releaseTag: (version) => version },
		crates: []
	},
	cacheDir: '.cache',
	landingSlug: 'index',
	topics: [],
	rustdoc: { directDependencyCrates: [], standardLibraryCrates: [] },
	...(prerender === undefined ? {} : { prerender })
});

describe('frameworkCrates', () => {
	it('treats config entries as repository workspaces with independent release versions', () => {
		const configured = config();
		const external = {
			crate: 'test-axum',
			repository: 'https://github.com/test/test-axum',
			versions: [{ id: '1.43.0' as never, releaseVersion: { raw: '1.43.0', major: 1, minor: 43, patch: 0, prerelease: [] }, label: '1.43.0' }],
			latest: '1.43.0' as never,
			releaseTag: (version: string) => `v${version}`
		};
		const withExternal = {
			...configured,
			framework: { ...configured.framework, crates: [external] }
		};

		expect(frameworkCrates(withExternal)).toEqual([configured.framework.root, external]);
		expect(frameworkCrateVersion(external, '1.43.0')?.releaseVersion.raw).toBe('1.43.0');
		expect(frameworkCrateVersion(external, '0.20.0')).toBeUndefined();
	});
});

describe('resolveFrameworkReferenceVersion', () => {
	const release = (id: string, raw = id) => ({
		id: id as never,
		label: raw,
		releaseVersion: parseVersion(raw, 'Test release')
	});
	const rootCurrent = release('root-current', '1.0.0');
	const sharedRelease = release('extra-shared', '1.0.0');
	const extraLatest = release('extra-latest', '9.0.0');
	const configured = config();

	const withVersions = {
		...configured,
		framework: {
			...configured.framework,
			root: { ...configured.framework.root, versions: [rootCurrent], latest: rootCurrent.id },
			crates: [{
				crate: 'test-extra',
				repository: '',
				versions: [sharedRelease, extraLatest],
				latest: extraLatest.id,
				releaseTag: (version: string) => version
			}]
		}
	} satisfies DocsConfig;

	it('keeps the active source release and matches corresponding releases by semantic version', () => {
		expect(resolveFrameworkReferenceVersion(withVersions, {
			source: 'test', activeSource: 'test', activeVersion: rootCurrent
		})?.version.id).toBe('root-current');
		expect(resolveFrameworkReferenceVersion(withVersions, {
			source: 'test-extra', activeSource: 'test', activeVersion: rootCurrent
		})?.version.id).toBe('extra-shared');
	});

	it('uses a valid explicit version and otherwise falls back to the target latest release', () => {
		const unrelated = release('root-next', '2.0.0');

		expect(resolveFrameworkReferenceVersion(withVersions, {
			source: 'test-extra', version: 'extra-shared', activeSource: 'test', activeVersion: unrelated
		})?.version.id).toBe('extra-shared');
		expect(resolveFrameworkReferenceVersion(withVersions, {
			source: 'test-extra', activeSource: 'test', activeVersion: unrelated
		})?.version.id).toBe('extra-latest');
		expect(resolveFrameworkReferenceVersion(withVersions, {
			source: 'test-extra', version: 'missing', activeSource: 'test', activeVersion: unrelated
		})).toBeUndefined();
	});

	it('keeps an independent active source release even when the root has no matching id', () => {
		expect(resolveFrameworkReferenceVersion(withVersions, {
			source: 'test-extra', activeSource: 'test-extra', activeVersion: extraLatest
		})?.version.id).toBe('extra-latest');
	});

	it.each([
		['1', '1.0'],
		['1.0', '1.0.0'],
		['1.0.0', '1']
	])('treats abbreviated releases %s and %s as corresponding', (activeRaw, targetRaw) => {
		const active = release('root-abbreviated', activeRaw);
		const corresponding = release('extra-abbreviated', targetRaw);
		const abbreviatedConfig = {
			...withVersions,
			framework: {
				...withVersions.framework,
				crates: [{
					...withVersions.framework.crates[0],
					versions: [corresponding, extraLatest]
				}]
			}
		} satisfies DocsConfig;

		expect(resolveFrameworkReferenceVersion(abbreviatedConfig, {
			source: 'test-extra', activeSource: 'test', activeVersion: active
		})?.version.id).toBe('extra-abbreviated');
	});

	it('ignores build metadata when matching corresponding releases', () => {
		const active = release('root-build', '1.0.0+root.1');
		const corresponding = release('extra-build', '1.0.0+extra.2');
		const buildConfig = {
			...withVersions,
			framework: {
				...withVersions.framework,
				crates: [{
					...withVersions.framework.crates[0],
					versions: [corresponding, extraLatest]
				}]
			}
		} satisfies DocsConfig;

		expect(resolveFrameworkReferenceVersion(buildConfig, {
			source: 'test-extra', activeSource: 'test', activeVersion: active
		})?.version.id).toBe('extra-build');
	});

	it('does not match different prereleases', () => {
		const active = release('root-prerelease', '1.0.0-rc.1');
		const differentPrerelease = release('extra-prerelease', '1.0.0-rc.2');
		const prereleaseConfig = {
			...withVersions,
			framework: {
				...withVersions.framework,
				crates: [{
					...withVersions.framework.crates[0],
					versions: [differentPrerelease, extraLatest]
				}]
			}
		} satisfies DocsConfig;

		expect(resolveFrameworkReferenceVersion(prereleaseConfig, {
			source: 'test-extra', activeSource: 'test', activeVersion: active
		})?.version.id).toBe('extra-latest');
	});
});

const rustdoc = (symbolPages?: RustdocEnrichmentConfig['symbolPages']): RustdocEnrichmentConfig => ({
	directDependencyCrates: 'workspace',
	standardLibraryCrates: [],
	...(symbolPages === undefined ? {} : { symbolPages })
});

describe('resolvePrerender', () => {
	it('defaults every route to prerendering', () => {
		expect(resolvePrerender(config(), 'docs', true)).toBe(true);
		expect(resolvePrerender(config(), 'symbols', false)).toBe(true);
	});

	it('supports a global setting', () => {
		expect(resolvePrerender(config(false), 'search', false)).toBe(false);
		expect(resolvePrerender(config('auto'), 'api', true)).toBe('auto');
	});

	it('selects environment-specific settings', () => {
		const configured = config({ development: false, production: 'auto' });

		expect(resolvePrerender(configured, 'symbols', true)).toBe(false);
		expect(resolvePrerender(configured, 'symbols', false)).toBe('auto');
	});

	it('uses route settings before the central default', () => {
		const configured = config({
			default: false,
			routes: { symbols: { development: false, production: 'auto' }, search: true }
		});

		expect(resolvePrerender(configured, 'docs', false)).toBe(false);
		expect(resolvePrerender(configured, 'symbols', false)).toBe('auto');
		expect(resolvePrerender(configured, 'search', true)).toBe(true);
	});

	it('inherits the default when an environment override is omitted', () => {
		const configured = config({ default: 'auto', routes: { symbols: { development: false } } });

		expect(resolvePrerender(configured, 'symbols', true)).toBe(false);
		expect(resolvePrerender(configured, 'symbols', false)).toBe('auto');
	});
});

describe('resolveSymbolPagesConfig', () => {
	it('defaults to disabled', () => {
		expect(resolveSymbolPagesConfig(rustdoc(), ['one'], true).enabled).toBe(false);
		expect(resolveSymbolPagesConfig(rustdoc(false), ['one'], true).enabled).toBe(false);
	});

	it('activates production forms only while building', () => {
		expect(resolveSymbolPagesConfig(rustdoc('production'), ['one'], false).enabled).toBe(false);
		expect(resolveSymbolPagesConfig(rustdoc('production'), ['one'], true).enabled).toBe(true);
		expect(resolveSymbolPagesConfig(rustdoc({}), ['one'], false).enabled).toBe(false);
	});

	it('activates true and always in development', () => {
		expect(resolveSymbolPagesConfig(rustdoc(true), ['one'], false).enabled).toBe(true);
		expect(resolveSymbolPagesConfig(rustdoc({ when: 'always' }), ['one'], false).enabled).toBe(true);
	});

	it('resolves configured, explicit, and all crate scopes', () => {
		expect([...resolveSymbolPagesConfig(rustdoc(true), ['one', 'two'], false).crates!]).toEqual(['one', 'two']);

		const explicit: RustdocEnrichmentConfig = { directDependencyCrates: ['exact-name'], standardLibraryCrates: [], symbolPages: true };
		expect([...resolveSymbolPagesConfig(explicit, ['ignored'], false).crates!]).toEqual(['exact-name']);
		expect(resolveSymbolPagesConfig(rustdoc({ when: 'always', crates: 'all' }), [], false).crates).toBeNull();
		expect([...resolveSymbolPagesConfig(rustdoc({ crates: ['a', 'b'] }), [], true).crates!]).toEqual(['a', 'b']);
	});
});
