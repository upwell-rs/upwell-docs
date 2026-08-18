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
		manifest: {
			framework: { crate: 'facade', crates: ['core-crate', 'other-crate'] },
			capabilities: ['symbols', 'docs'],
			sourceLinkTemplate: 'https://source/{path}#L{line}',
			sources: [{ crate: 'facade', version: '1.0.0', repository: '', sha: 'abc', crates: ['core-crate', 'other-crate'], primary: true }]
		},
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
		framework: {
			name: 'Framework',
			root: { crate: 'facade', repository: '', versions: [version], latest: version.id, releaseTag: (value: string) => value },
			crates: []
		},
		cacheDir: '', readOnlyArtifactVersions: [], landingSlug: '', topics: [],
		rustdoc: { directDependencyCrates: ['core-crate'], standardLibraryCrates: [], symbolPages }
	} satisfies DocsConfig;

	return { artifact, config };
}

describe('buildCatalog', () => {
	it('generates declaration pages for every crate owned by the repository', () => {
		const { artifact, config } = fixture({ when: 'always', crates: 'configured' });
		const catalog = buildCatalog(artifact, config.framework.root, version, [], config, false, (_source, _version, segments) => `/symbols/${segments}`);

		expect(catalog.records.filter((record) => record.destination.kind === 'generated')).toHaveLength(2);
		expect(catalog.resolve('facade::Thing')?.destination).toEqual({ kind: 'generated', href: '/symbols/core_crate/module/Thing', segments: 'core_crate/module/Thing' });
		expect(catalog.destination('other_crate::Other')?.kind).toBe('generated');
	});

	it('gives a declaration-path authored page precedence over re-export pages', () => {
		const { artifact, config } = fixture(true);
		const pages = [page('facade::Thing'), page('core_crate::module::Thing')];
		const catalog = buildCatalog(artifact, config.framework.root, version, pages, config, false, (_source, _version, segments) => `/symbols/${segments}`);

		expect(catalog.resolve('facade::Thing')?.destination).toMatchObject({ kind: 'authored', href: '/symbols/core_crate/module/Thing' });
	});

	it('preserves the deterministic ambiguous re-export error without a declaration page', () => {
		const { artifact, config } = fixture(true);
		const ambiguous = { ...artifact, index: { ...artifact.index, paths: { ...artifact.index.paths, 'facade::prelude::Thing': 'core_crate::module::Thing' } } };

		expect(() => buildCatalog(ambiguous, config.framework.root, version, [page('facade::Thing'), page('facade::prelude::Thing')], config, false, () => '')).toThrow('Two symbol pages document the same symbol.');
	});

	it('keeps full docs out of compact catalog records', () => {
		const { artifact, config } = fixture(true);
		const catalog = buildCatalog(artifact, config.framework.root, version, [], config, false, () => '/symbol');
		const serialized = JSON.stringify(catalog.records);

		expect(serialized).toContain('Bounded summary.');
		expect(serialized).not.toContain('Full docs.');
	});

	it('routes vendored symbols to their independently versioned repository', () => {
		const { artifact, config } = fixture(true);
		const external = {
			crate: 'other',
			repository: 'https://github.com/test/other',
			versions: [{ ...version, id: '1.43.0' as typeof version.id, releaseVersion: parseExactVersion('1.43.0', 'test'), label: '1.43.0' }],
			latest: '1.43.0' as typeof version.id,
			releaseTag: (value: string) => value
		};
		const configured = { ...config, framework: { ...config.framework, crates: [external] } };
		const vendored = {
			...artifact,
			manifest: {
				...artifact.manifest,
				sources: [
					...artifact.manifest.sources!,
					{ crate: 'other', version: '1.43.0', repository: external.repository, sha: 'def', crates: ['other-crate'], primary: false }
				]
			}
		};
		const catalog = buildCatalog(vendored, configured.framework.root, version, [], configured, false,
			(source, release, segments) => `/docs/${source}/${release}/symbols/${segments}`);

		expect(catalog.resolve('other_crate::Other')).toMatchObject({
			source: 'other',
			destination: { kind: 'generated', href: '/docs/other/1.43.0/symbols/other_crate/Other' }
		});
	});

	it('keeps primary symbols on the selected documentation release', () => {
		const { artifact, config } = fixture(true);
		const mismatchedPackage = {
			...artifact,
			manifest: {
				...artifact.manifest,
				sources: [{ ...artifact.manifest.sources![0], version: '0.20.0', primary: true }]
			}
		};
		const catalog = buildCatalog(mismatchedPackage, config.framework.root, version, [], config, false,
			(source, release, segments) => `/docs/${source}/${release}/symbols/${segments}`);

		expect(catalog.resolve('core_crate::module::Thing')?.destination).toMatchObject({
			kind: 'generated',
			href: `/docs/facade/${version.id}/symbols/core_crate/module/Thing`
		});
	});

	it('rejects an old artifact when generated pages require full docs', () => {
		const { artifact, config } = fixture(true);
		const oldArtifact = { ...artifact, manifest: { ...artifact.manifest, capabilities: ['symbols'] } } as LoadedArtifact;

		expect(() => buildCatalog(oldArtifact, config.framework.root, version, [], config, false, () => '/symbol')).toThrow(
			'artifact for 1.0.0 predates generated symbol documentation'
		);
	});
});
