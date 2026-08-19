import { describe, expect, it } from 'vitest';

import { normalizeSitePath, resolvePageMetadata, type PageMetadata } from './metadata.ts';

const guide: PageMetadata = {
	title: 'Getting started',
	description: 'Build an Upwell application.',
	path: '/docs/1.0.0/getting-started',
	version: '1.0.0'
};

describe('resolvePageMetadata', () => {
	it('builds a branded title and canonical URL', () => {
		expect(resolvePageMetadata(guide, { name: 'Upwell', origin: 'https://upwell.rs' })).toEqual({
			...guide,
			fullTitle: 'Getting started · Upwell 1.0.0',
			url: 'https://upwell.rs/docs/1.0.0/getting-started'
		});
	});

	it('uses the explicit source path without retaining transient URL parts', () => {
		const resolved = resolvePageMetadata(
			{ ...guide, title: 'src/lib.rs source', path: '/docs/upwell/1.0.0/src/src/lib.rs?plain=1#L20' },
			{ name: 'Upwell', origin: 'https://docs.upwell.rs' }
		);

		expect(resolved.fullTitle).toBe('src/lib.rs source · Upwell 1.0.0');
		expect(resolved.url).toBe('https://docs.upwell.rs/docs/upwell/1.0.0/src/src/lib.rs');
	});
});

describe('normalizeSitePath', () => {
	it.each([
		['/docs/1.0.0/getting-started', '/docs/1.0.0/getting-started'],
		['docs/upwell/1.0.0/symbols', '/docs/upwell/1.0.0/symbols'],
		['/docs/upwell/1.0.0/symbols/component?view=compact#examples', '/docs/upwell/1.0.0/symbols/component'],
		['', '/']
	])('normalizes %o', (value, expected) => {
		expect(normalizeSitePath(value)).toBe(expected);
	});
});
