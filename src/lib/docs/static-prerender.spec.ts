import { describe, expect, it } from 'vitest';

import { resolvePrerender } from '@upwell/docs-core/config';

import { experimentalStaticSourcesPrerender } from '../../../docs.config.ts';

describe('experimental static source prerender policy', () => {
	it('keeps source pages while excluding colliding source-file API output', () => {
		const config = { prerender: experimentalStaticSourcesPrerender } as never;

		expect(resolvePrerender(config, 'docs', false)).toBe(true);
		expect(resolvePrerender(config, 'symbols', false)).toBe(true);
		expect(resolvePrerender(config, 'sources', false)).toBe(true);
		expect(resolvePrerender(config, 'sourceApi', false)).toBe(false);
	});
});
