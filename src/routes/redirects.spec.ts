import { describe, expect, it } from 'vitest';

import { docsConfig, latestVersion } from '../lib/docs/config.ts';

describe('documentation redirects', () => {
	it('targets the explicit release landing page', () => {
		expect(`/docs/${latestVersion(docsConfig).id}/${docsConfig.landingSlug}`).toBe('/docs/1.0.0/getting-started');
	});
});
