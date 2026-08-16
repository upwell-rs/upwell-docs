import { describe, expect, it } from 'vitest';

import { search, type SearchRecord } from './rank.ts';

function record(overrides: Partial<SearchRecord> & { title: string }): SearchRecord {
	return { href: `/docs/latest/${overrides.title}`, kind: 'guide', ...overrides };
}

/** Titles of the results, in order, which is what ranking is actually about. */
function titles(records: readonly SearchRecord[], query: string): string[] {
	return search(records, query).map((result) => result.record.title);
}

describe('search', () => {
	it('returns nothing for an empty query, rather than everything', () => {
		expect(search([record({ title: 'Routing' })], '   ')).toEqual([]);
	});

	it('drops records that match nothing', () => {
		expect(search([record({ title: 'Routing' })], 'websocket')).toEqual([]);
	});

	it('puts an exact title first', () => {
		const records = [
			record({ title: 'HttpRequestBuilder' }),
			record({ title: 'HttpRequest' }),
			record({ title: 'Using HttpRequest in handlers' })
		];

		expect(titles(records, 'httprequest')[0]).toBe('HttpRequest');
	});

	it('ranks a prefix above a mid-word match', () => {
		const records = [record({ title: 'AnHttpRequestThing' }), record({ title: 'HttpRequest scope' })];

		expect(titles(records, 'httprequest')[0]).toBe('HttpRequest scope');
	});

	it('ranks a word start above a match inside a word', () => {
		// `request` beginning a word is a better hit than it sitting inside a longer identifier.
		const records = [record({ title: 'HttpRequestBuilder' }), record({ title: 'The request scope' })];

		expect(titles(records, 'request')[0]).toBe('The request scope');
	});

	it('matches a symbol path through the detail line', () => {
		const records = [record({ title: 'Stomp', kind: 'symbol', detail: 'upwell::axum::Stomp' })];

		expect(titles(records, 'upwell::axum')).toEqual(['Stomp']);
	});

	it('prefers a guide over a symbol when nothing else separates them', () => {
		// A reader typing a word rather than a path is more likely to want prose.
		const records = [
			record({ title: 'Routing', kind: 'symbol' }),
			record({ title: 'Routing', kind: 'guide' })
		];

		expect(search(records, 'routing')[0].record.kind).toBe('guide');
	});

	it('prefers the shorter title when scores tie', () => {
		const records = [record({ title: 'Routing in depth' }), record({ title: 'Routing' })];

		expect(titles(records, 'routing')[0]).toBe('Routing');
	});

	describe('headings', () => {
		it('points at the matching section rather than the top of the page', () => {
			const records = [
				record({
					title: 'Dependency injection',
					href: '/docs/latest/di',
					headings: [{ id: 'scopes', text: 'Scopes' }]
				})
			];

			expect(search(records, 'scopes')[0].href).toBe('/docs/latest/di#scopes');
		});

		it('reports which heading matched', () => {
			const records = [
				record({ title: 'Guide', headings: [{ id: 'scopes', text: 'Scopes' }] })
			];

			expect(search(records, 'scopes')[0].heading).toBe('Scopes');
		});

		it('links to the page itself when only the body matched', () => {
			const records = [record({ title: 'Guide', href: '/docs/latest/g', text: 'about lifetimes' })];

			expect(search(records, 'lifetimes')[0].href).toBe('/docs/latest/g');
		});
	});

	describe('excerpts', () => {
		it('shows context around a body match', () => {
			const records = [record({ title: 'Guide', text: 'A component is constructed by the container.' })];

			expect(search(records, 'container')[0].excerpt).toContain('container');
		});

		it('elides the ends of a long body', () => {
			const records = [record({ title: 'Guide', text: `${'x'.repeat(300)} needle ${'y'.repeat(300)}` })];
			const excerpt = search(records, 'needle')[0].excerpt ?? '';

			expect(excerpt.startsWith('…')).toBe(true);
			expect(excerpt.endsWith('…')).toBe(true);
		});

		it('gives no excerpt when the body did not match', () => {
			const records = [record({ title: 'Routing', text: 'unrelated prose' })];

			expect(search(records, 'routing')[0].excerpt).toBeUndefined();
		});
	});

	it('is case-insensitive', () => {
		expect(titles([record({ title: 'Routing' })], 'ROUTING')).toEqual(['Routing']);
	});

	it('caps the number of results', () => {
		const records = Array.from({ length: 50 }, (_, index) => record({ title: `Routing ${index}` }));

		expect(search(records, 'routing', 5)).toHaveLength(5);
	});

	describe('kind filters', () => {
		const records = [
			record({ title: 'Component', kind: 'symbol', symbolKind: 'trait', detail: 'upwell::Component' }),
			record({ title: 'Component', kind: 'symbol', symbolKind: 'struct', detail: 'other::Component' }),
			record({ title: 'Components', kind: 'guide' })
		];

		it('narrows to the requested symbol kind', () => {
			const results = search(records, 'trait:Component');

			expect(results).toHaveLength(1);
			expect(results[0].record.symbolKind).toBe('trait');
		});

		it('narrows to guides', () => {
			const results = search(records, 'doc:component');

			expect(results).toHaveLength(1);
			expect(results[0].record.kind).toBe('guide');
		});

		it('lists a kind alphabetically when no text follows the filter', () => {
			// Browsing rather than searching: with nothing to match there is nothing to rank.
			const results = search(records, 'struct:');

			expect(results.map((result) => result.record.title)).toEqual(['Component']);
		});

		it('still returns nothing for an empty query with no filter', () => {
			expect(search(records, '')).toEqual([]);
		});

		it('stops treating a kind as incidental once it has been asked for', () => {
			const variants = [
				record({ title: 'Scopes', kind: 'symbol', symbolKind: 'variant' }),
				record({ title: 'Scopes', kind: 'guide' })
			];

			// Unfiltered, the guide wins; asked for by kind, the variant is what was wanted.
			expect(search(variants, 'scopes')[0].record.kind).toBe('guide');
			expect(search(variants, 'variant:scopes')[0].record.symbolKind).toBe('variant');
		});
	});
});
