import { describe, expect, it } from 'vitest';

import { docsPreprocessors } from './preprocessors.ts';

describe('docsPreprocessors', () => {
	it('enables GFM for authored MDsveX pages', () => {
		const preprocessors = docsPreprocessors({
			config: {} as Parameters<typeof docsPreprocessors>[0]['config'],
			projectRoot: '/tmp/docs',
			versionModule: '@upwell/docs-kit/authoring'
		});

		expect(preprocessors.remarkPlugins).toHaveLength(1);
		expect(preprocessors.remarkPlugins[0]?.name).toBe('remarkGfm');
	});
});
