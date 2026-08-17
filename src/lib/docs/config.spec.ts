import { describe, expect, it } from 'vitest';

import { docsConfig } from '../../../docs.config.ts';
import { isArtifactReadOnly, isSymbolEnrichmentEligible, latestVersion, resolveVersion } from './config.ts';

describe('documentation releases', () => {
	it('resolves latest to the explicit public release', () => {
		expect(resolveVersion(docsConfig, 'latest')?.id).toBe('1.0.0');
		expect(latestVersion(docsConfig).releaseVersion.raw).toBe('1.0.0');
	});

	it('keeps aliases out of the picker entries', () => {
		expect(docsConfig.versions.map((version) => ({ id: version.id, label: version.label }))).toEqual([
			{ id: '1.0.0', label: '1.0.0' },
			{ id: '0.20.0', label: '0.20.0' }
		]);
	});

	it('preserves the legacy artifact while allowing the current release to refresh', () => {
		expect(isArtifactReadOnly(docsConfig, '0.20.0')).toBe(true);
		expect(isArtifactReadOnly(docsConfig, '1.0.0')).toBe(false);
	});

	it('only permits the current Upwell artifact to enrich symbols', () => {
		const legacy = resolveVersion(docsConfig, '0.20.0')!;
		const current = resolveVersion(docsConfig, '1.0.0')!;

		expect(isSymbolEnrichmentEligible(docsConfig, legacy)).toBe(false);
		expect(isSymbolEnrichmentEligible(docsConfig, current)).toBe(true);
	});
});
