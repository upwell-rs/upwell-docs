import { describe, expect, it } from 'vitest';

import { parseExactVersion, versionId } from '@upwell/docs-core/semver';
import type { DocsConfig, DocsVersion } from '@upwell/docs-core/config';
import type { LoadedArtifact } from '@upwell/docs-tools/artifact/load';
import type { Symbol } from '@upwell/docs-tools/rustdoc/symbols';

import { buildCatalog } from './artifact.ts';

const version: DocsVersion = { id: versionId('1.0'), releaseVersion: parseExactVersion('1.0.0', 'test'), label: '1.0' };
const page = (symbol: string) => ({ symbol, segments: symbol.replaceAll('::', '/'), title: symbol.split('::').pop()!, draft: false, topics: [] });
const symbol = (path: string, overrides: Partial<Symbol> = {}): Symbol => ({
	path, name: path.split('::').pop()!, kind: 'struct', procMacro: null, crate: 'core-crate', signature: null, doc: null, docs: null, source: null,
	deprecation: null, feature: null, returns: null, implementations: [], implementors: [], derefTarget: null, aliasOf: null, ...overrides
});

function fixture(symbolPages: DocsConfig['rustdoc']['symbolPages']): { artifact: LoadedArtifact; config: DocsConfig } {
	const canonical = symbol('core_crate::module::Thing', { crate: 'core-crate', doc: 'Bounded summary.', docs: 'Bounded summary.\n\nFull docs.' });
	const other = symbol('other_crate::Other', { crate: 'other-crate' });
	const artifact = {
		manifest: { framework: { crates: ['core-crate', 'other-crate'] }, capabilities: ['symbols', 'docs'], sourceLinkTemplate: 'https://source/{path}#L{line}' },
		index: {
			symbols: [canonical, other],
			paths: { 'core_crate::module::Thing': canonical.path, 'facade::Thing': canonical.path, 'other_crate::Other': other.path },
			names: { Thing: [canonical.path], Other: [other.path] },
			externals: { symbols: [], names: {}, direct: [], aliases: {} }
		},
		crates: [],
		root: '/tmp/artifact'
	} as unknown as LoadedArtifact;
	const config = {
		framework: { crate: 'facade', name: 'Framework', repository: '', releaseTag: (value: string) => value },
		versions: [version], latest: version.id, cacheDir: '', readOnlyArtifactVersions: [], symbolEnrichmentVersions: [version.id], landingSlug: '', topics: [],
		rustdoc: { directDependencyCrates: ['core-crate'], standardLibraryCrates: [], symbolPages }
	} satisfies DocsConfig;

	return { artifact, config };
}

describe('buildCatalog', () => {
	it('generates one declaration-path record and resolves aliases to it', () => {
		const { artifact, config } = fixture({ when: 'always', crates: 'configured' });
		const catalog = buildCatalog(artifact, version, [], config, false, (_version, segments) => `/symbols/${segments}`);

		expect(catalog.records.filter((record) => record.destination.kind === 'generated')).toHaveLength(1);
		expect(catalog.resolve('facade::Thing')?.destination).toEqual({ kind: 'generated', href: '/symbols/core_crate/module/Thing', segments: 'core_crate/module/Thing' });
		expect(catalog.destination('other_crate::Other')?.kind).toBe('source');
	});

	it('gives a declaration-path authored page precedence over re-export pages', () => {
		const { artifact, config } = fixture(true);
		const pages = [page('facade::Thing'), page('core_crate::module::Thing')];
		const catalog = buildCatalog(artifact, version, pages, config, false, (_version, segments) => `/symbols/${segments}`);

		expect(catalog.resolve('facade::Thing')?.destination).toMatchObject({ kind: 'authored', href: '/symbols/core_crate/module/Thing' });
	});

	it('preserves the deterministic ambiguous re-export error without a declaration page', () => {
		const { artifact, config } = fixture(true);
		const ambiguous = { ...artifact, index: { ...artifact.index, paths: { ...artifact.index.paths, 'facade::prelude::Thing': 'core_crate::module::Thing' } } };

		expect(() => buildCatalog(ambiguous, version, [page('facade::Thing'), page('facade::prelude::Thing')], config, false, () => '')).toThrow('Two symbol pages document the same symbol.');
	});

	it('keeps full docs out of compact catalog records', () => {
		const { artifact, config } = fixture(true);
		const catalog = buildCatalog(artifact, version, [], config, false, () => '/symbol');
		const serialized = JSON.stringify(catalog.records);

		expect(serialized).toContain('Bounded summary.');
		expect(serialized).not.toContain('Full docs.');
	});

	it('rejects an old artifact when generated pages require full docs', () => {
		const { artifact, config } = fixture(true);
		const oldArtifact = { ...artifact, manifest: { ...artifact.manifest, capabilities: ['symbols'] } } as LoadedArtifact;

		expect(() => buildCatalog(oldArtifact, version, [], config, false, () => '/symbol')).toThrow(
			'artifact for 1.0.0 predates generated symbol documentation'
		);
	});
});
