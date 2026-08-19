import { describe, expect, it } from 'vitest';

import { filterSymbolRecords, type SymbolRecord } from './filter-symbol-records.ts';

const records: readonly SymbolRecord[] = [
	{
		path: 'framework::App',
		name: 'App',
		crate: 'framework',
		kind: 'struct',
		summary: 'Application runtime.',
		href: '/symbols/App',
		authored: true
	},
	{
		path: 'framework_extra::Client',
		name: 'Client',
		crate: 'framework-extra',
		kind: 'struct',
		summary: null,
		href: '/symbols/Client',
		authored: false
	}
];

describe('filterSymbolRecords', () => {
	it('matches paths and summaries without regard to case', () => {
		expect(filterSymbolRecords(records, 'app', 'all')).toEqual([records[0]]);
		expect(filterSymbolRecords(records, 'RUNTIME', 'all')).toEqual([records[0]]);
	});

	it('trims the query and supports records without summaries', () => {
		expect(filterSymbolRecords(records, '  client  ', 'all')).toEqual([records[1]]);
	});

	it('limits results to the selected crate', () => {
		expect(filterSymbolRecords(records, '', 'framework-extra')).toEqual([records[1]]);
	});

	it('returns no records when nothing matches', () => {
		expect(filterSymbolRecords(records, 'missing', 'all')).toEqual([]);
	});
});
