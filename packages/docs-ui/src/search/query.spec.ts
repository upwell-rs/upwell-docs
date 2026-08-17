import { describe, expect, it } from 'vitest';

import { admits, parseQuery } from './query.ts';

describe('parseQuery', () => {
	it('reads a plain query as text', () => {
		expect(parseQuery('HttpRequest')).toMatchObject({ text: 'HttpRequest', filter: null });
	});

	it('reads a kind filter and the text after it', () => {
		expect(parseQuery('struct:Component')).toMatchObject({
			text: 'Component',
			symbolKinds: ['struct'],
			filter: 'struct'
		});
	});

	it('accepts a filter with no text, for browsing a kind', () => {
		expect(parseQuery('trait:')).toMatchObject({ text: '', symbolKinds: ['trait'] });
	});

	it('maps a word to every index kind it covers', () => {
		// `macro` means both kinds to a reader, who does not distinguish them.
		expect(parseQuery('macro:x').symbolKinds).toEqual(['macro', 'proc_macro']);
	});

	it('restricts `doc` to authored guides', () => {
		expect(parseQuery('doc:routing')).toMatchObject({ recordKinds: ['guide'], symbolKinds: [] });
	});

	it('distinguishes a reference page from a bare symbol', () => {
		expect(parseQuery('symbol:component').recordKinds).toEqual(['symbol-page']);
	});

	it('leaves a Rust path alone, colons and all', () => {
		// The failure this prevents: reading `HashMap::new` as a filter and matching nothing.
		expect(parseQuery('HashMap::new')).toMatchObject({ text: 'HashMap::new', filter: null });
	});

	it('leaves an unknown prefix as text', () => {
		expect(parseQuery('impl:Foo')).toMatchObject({ text: 'impl:Foo', filter: null });
	});

	it('trims surrounding space', () => {
		expect(parseQuery('  struct: Component  ')).toMatchObject({ text: 'Component', filter: 'struct' });
	});
});

describe('admits', () => {
	const guide = { kind: 'guide' };
	const structSymbol = { kind: 'symbol', symbolKind: 'struct' };
	const traitSymbol = { kind: 'symbol', symbolKind: 'trait' };
	const referencePage = { kind: 'symbol-page' };

	it('admits everything when there is no filter', () => {
		const query = parseQuery('component');

		expect(admits(query, guide)).toBe(true);
		expect(admits(query, structSymbol)).toBe(true);
	});

	it('keeps only the requested symbol kind', () => {
		const query = parseQuery('struct:component');

		expect(admits(query, structSymbol)).toBe(true);
		expect(admits(query, traitSymbol)).toBe(false);
		expect(admits(query, guide)).toBe(false);
	});

	it('keeps a reference page whose symbol is of the requested kind', () => {
		// The bug this prevents: `macro:component` dropping the page written about that very macro,
		// because the filter also constrained the record kind.
		const query = parseQuery('macro:component');
		const documentedMacro = { kind: 'symbol-page', symbolKind: 'proc_macro' };

		expect(admits(query, documentedMacro)).toBe(true);
	});

	it('excludes a reference page whose symbol is a different kind', () => {
		const query = parseQuery('struct:component');

		expect(admits(query, { kind: 'symbol-page', symbolKind: 'trait' })).toBe(false);
	});

	it('keeps only guides for a doc filter', () => {
		const query = parseQuery('doc:routing');

		expect(admits(query, guide)).toBe(true);
		expect(admits(query, structSymbol)).toBe(false);
		expect(admits(query, referencePage)).toBe(false);
	});

	it('keeps only reference pages for a symbol filter', () => {
		const query = parseQuery('symbol:component');

		expect(admits(query, referencePage)).toBe(true);
		expect(admits(query, structSymbol)).toBe(false);
	});
});
