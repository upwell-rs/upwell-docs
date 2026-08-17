import { describe, expect, it } from 'vitest';

import { matchField, segments, terms } from './match.ts';

/** The matched text of a field, which is what a reader sees emphasised. */
function highlighted(field: string, query: string): string[] {
	const found = matchField(field, terms(query));

	return found ? segments(field, found.ranges).filter((piece) => piece.match).map((piece) => piece.text) : [];
}

function scoreOf(field: string, query: string): number {
	return matchField(field, terms(query))?.score ?? 0;
}

describe('terms', () => {
	it('splits on whitespace and lowercases', () => {
		expect(terms('  Http   Request ')).toEqual(['http', 'request']);
	});

	it('has no terms for an empty query', () => {
		expect(terms('   ')).toEqual([]);
	});
});

describe('matchField', () => {
	it('scores an exact match highest', () => {
		expect(scoreOf('HttpRequest', 'httprequest')).toBe(1);
	});

	it('ranks a prefix above a match inside a word', () => {
		expect(scoreOf('Request', 'req')).toBeGreaterThan(scoreOf('HttpRequestBuilder', 'equest'));
	});

	it('ranks a word-boundary match above one buried inside a word', () => {
		// `Request` starting a word in `HttpRequest` is a better hit than the same letters inside
		// `PrerequisiteCheck`, which is what a reader means far less often.
		expect(scoreOf('HttpRequest', 'request')).toBeGreaterThan(scoreOf('PrerequisiteCheck', 'requis'));
	});

	it('matches nothing when the query is absent', () => {
		expect(matchField('HttpRequest', terms('websocket'))).toBeUndefined();
	});

	it('matches nothing for an empty query', () => {
		expect(matchField('HttpRequest', terms(''))).toBeUndefined();
	});

	describe('multiple terms', () => {
		it('finds a camel-case identifier from separated words', () => {
			// The whole point: `http request` cannot match as one substring, because the space is not
			// in the identifier.
			expect(matchField('HttpRequest', terms('http request'))).toBeDefined();
		});

		it('requires every term to appear', () => {
			expect(matchField('HttpRequest', terms('http websocket'))).toBeUndefined();
		});

		it('finds terms in either order', () => {
			expect(matchField('HttpRequest', terms('request http'))).toBeDefined();
		});

		it('highlights each term where it matched', () => {
			expect(highlighted('HttpRequest', 'http request')).toEqual(['HttpRequest']);
		});

		it('never outscores an exact match', () => {
			expect(scoreOf('HttpRequest', 'http request')).toBeLessThan(scoreOf('HttpRequest', 'httprequest'));
		});

		it('is held down by its weakest term', () => {
			const strong = scoreOf('HttpRequest', 'http request');
			const weak = scoreOf('HttpRequestBuilderRegistry', 'http gsy');

			expect(weak).toBeLessThan(strong);
		});
	});

	describe('subsequence matching', () => {
		it('finds an identifier from its word initials', () => {
			expect(matchField('HttpRequest', terms('hreq'))).toBeDefined();
		});

		it('prefers word boundaries when placing characters', () => {
			expect(highlighted('HttpRequest', 'hr')).toEqual(['H', 'R']);
		});

		it('scores below a real substring match', () => {
			expect(scoreOf('HttpRequest', 'hreq')).toBeLessThan(scoreOf('HttpRequest', 'http'));
		});

		it('rejects characters scattered across a long name', () => {
			// Every long identifier contains the letters of every short query somewhere. A search that
			// treats that as a match returns everything, which is the same as returning nothing.
			expect(matchField('WebsocketSubprotocolNegotiationError', terms('xyz'))).toBeUndefined();
			expect(matchField('WebsocketSubprotocolNegotiationError', terms('wte'))).toBeUndefined();
		});

		it('rejects a query whose characters are not in order', () => {
			expect(matchField('HttpRequest', terms('qh'))).toBeUndefined();
		});
	});
});

describe('segments', () => {
	it('splits a field into matched and unmatched pieces', () => {
		const found = matchField('HttpRequest', terms('request'))!;

		expect(segments('HttpRequest', found.ranges)).toEqual([
			{ text: 'Http', match: false },
			{ text: 'Request', match: true }
		]);
	});

	it('keeps text after the last match', () => {
		const found = matchField('HttpRequestBuilder', terms('request'))!;

		expect(segments('HttpRequestBuilder', found.ranges).at(-1)).toEqual({ text: 'Builder', match: false });
	});

	it('reassembles into the original field', () => {
		const field = 'WebsocketProtocol';
		const found = matchField(field, terms('web proto'))!;

		expect(segments(field, found.ranges).map((piece) => piece.text).join('')).toBe(field);
	});
});
