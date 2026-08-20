import { describe, expect, it } from 'vitest';

import { docsConfig } from '../../docs.config.ts';
import { latestVersion } from '@upwell/docs-core/config';
import { guideRedirects } from '../lib/docs/guide-redirects.ts';

describe('documentation redirects', () => {
	it('targets the explicit release landing page', () => {
		expect(`/docs/${latestVersion(docsConfig).id}/${docsConfig.landingSlug}`).toBe('/docs/1.0.0/getting-started');
	});

	it('retains permanent aliases for moved guide routes', () => {
		expect(guideRedirects['di/components']).toBe('framework/dependency-injection/components');
		expect(guideRedirects['axum/streaming-http']).toBe('axum/http/streaming');
		expect(guideRedirects['clients/native-rpc']).toBe('clients/native/rpc');
		expect(guideRedirects['cargo-upwell/renderer-authoring']).toBe('cargo-upwell/renderers/authoring');
	});
});
