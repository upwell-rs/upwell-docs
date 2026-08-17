import { describe, expect, it } from 'vitest';

import { resolveSymbolPagesConfig, type RustdocEnrichmentConfig } from './config.ts';

const rustdoc = (symbolPages?: RustdocEnrichmentConfig['symbolPages']): RustdocEnrichmentConfig => ({
	directDependencyCrates: 'workspace',
	standardLibraryCrates: [],
	...(symbolPages === undefined ? {} : { symbolPages })
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
