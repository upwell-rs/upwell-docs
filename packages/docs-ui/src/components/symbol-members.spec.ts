import { describe, expect, it } from 'vitest';

import { selectSymbolMembers } from './symbol-members.ts';
import type { SymbolMember } from '../types.ts';

const members: readonly SymbolMember[] = [
	{ name: 'new', kind: 'assoc_fn', signature: null, doc: null, deprecated: false, sourceHref: null },
	{ name: 'serve', kind: 'method', signature: null, doc: null, deprecated: false, sourceHref: null },
	{ name: 'timeout', kind: 'assoc_const', signature: null, doc: null, deprecated: false, sourceHref: null },
	{ name: 'shutdown', kind: 'method', signature: null, doc: null, deprecated: true, sourceHref: null }
];

function names(selected: readonly SymbolMember[]): string[] {
	return selected.map((member) => member.name);
}

describe('selectSymbolMembers', () => {
	it('preserves source order when no explicit member order is requested', () => {
		expect(names(selectSymbolMembers(members, {}))).toEqual(['new', 'serve', 'timeout', 'shutdown']);
	});

	it('lists only requested names in their requested order', () => {
		expect(names(selectSymbolMembers(members, { only: ['shutdown', 'new', 'serve'] }))).toEqual([
			'shutdown',
			'new',
			'serve'
		]);
	});

	it('omits requested names that are not members', () => {
		expect(names(selectSymbolMembers(members, { only: ['missing', 'serve', 'also-missing'] }))).toEqual(['serve']);
	});

	it('excludes names before applying an explicit order', () => {
		expect(names(selectSymbolMembers(members, { only: ['shutdown', 'serve', 'new'], except: ['serve'] }))).toEqual([
			'shutdown',
			'new'
		]);
	});

	it('filters to the requested kinds while preserving source order', () => {
		expect(names(selectSymbolMembers(members, { kinds: ['method'] }))).toEqual(['serve', 'shutdown']);
	});

	it('applies kinds before resolving explicit names', () => {
		expect(names(selectSymbolMembers(members, { only: ['timeout', 'serve', 'new'], kinds: ['method', 'assoc_fn'] }))).toEqual([
			'serve',
			'new'
		]);
	});

	it('returns no members when a filter excludes every member', () => {
		expect(selectSymbolMembers(members, { except: ['new', 'serve', 'timeout', 'shutdown'] })).toEqual([]);
	});
});
