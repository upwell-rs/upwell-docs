import { describe, expect, it } from 'vitest';

import { docsConfig, latestVersion, resolveVersion } from '../docs/config.ts';
import { artifactVersion, getArtifact } from './artifact.ts';

describe('artifact lookup', () => {
	it('uses the public documentation release as the cache identity', () => {
		expect(artifactVersion(latestVersion(docsConfig))).toBe('1.0.0');
	});

	it('does not load the preserved predecessor artifact for Upwell symbol enrichment', async () => {
		const legacy = resolveVersion(docsConfig, '0.20.0')!;

		await expect(getArtifact(legacy)).resolves.toBeNull();
	});
});
