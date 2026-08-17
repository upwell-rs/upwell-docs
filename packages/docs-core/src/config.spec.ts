import { describe, expect, it } from 'vitest';

import {
	resolvePrerender,
	resolveSymbolPagesConfig,
	type DocsConfig,
	type RustdocEnrichmentConfig
} from './config.ts';

const config = (prerender?: DocsConfig['prerender']): DocsConfig => ({
	framework: { crate: 'test', name: 'Test', repository: '', releaseTag: (version) => version },
	versions: [],
	latest: '' as DocsConfig['latest'],
	cacheDir: '.cache',
	symbolEnrichmentVersions: [],
	landingSlug: 'index',
	topics: [],
	rustdoc: { directDependencyCrates: [], standardLibraryCrates: [] },
	...(prerender === undefined ? {} : { prerender })
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
