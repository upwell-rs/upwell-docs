export interface Query {
	readonly text: string;
	readonly symbolKinds: readonly string[];
	readonly recordKinds: readonly ('guide' | 'symbol-page' | 'symbol')[];
	readonly filter: string | null;
}

const FILTERS: Record<string, Pick<Query, 'symbolKinds' | 'recordKinds'>> = {
	struct: { symbolKinds: ['struct'], recordKinds: [] },
	enum: { symbolKinds: ['enum'], recordKinds: [] },
	trait: { symbolKinds: ['trait'], recordKinds: [] },
	fn: { symbolKinds: ['function'], recordKinds: [] },
	function: { symbolKinds: ['function'], recordKinds: [] },
	macro: { symbolKinds: ['macro', 'proc_macro'], recordKinds: [] },
	mod: { symbolKinds: ['module'], recordKinds: [] },
	module: { symbolKinds: ['module'], recordKinds: [] },
	type: { symbolKinds: ['type_alias'], recordKinds: [] },
	const: { symbolKinds: ['constant', 'assoc_const'], recordKinds: [] },
	variant: { symbolKinds: ['variant'], recordKinds: [] },
	doc: { symbolKinds: [], recordKinds: ['guide'] },
	docs: { symbolKinds: [], recordKinds: ['guide'] },
	symbol: { symbolKinds: [], recordKinds: ['symbol-page'] }
};

export const FILTER_WORDS: readonly string[] = Object.keys(FILTERS);

const PREFIX = /^([a-z]+):(.*)$/s;

export function parseQuery(raw: string): Query {
	const trimmed = raw.trim();
	const match = PREFIX.exec(trimmed);
	const filter = match ? FILTERS[match[1]] : undefined;

	if (!match || !filter) {
		return { text: trimmed, symbolKinds: [], recordKinds: [], filter: null };
	}

	return { text: match[2].trim(), symbolKinds: filter.symbolKinds, recordKinds: filter.recordKinds, filter: match[1] };
}

export function admits(query: Query, record: { kind: string; symbolKind?: string }): boolean {
	if (query.recordKinds.length > 0 && !query.recordKinds.includes(record.kind as 'guide')) {
		return false;
	}

	if (query.symbolKinds.length === 0) {
		return true;
	}

	return record.symbolKind !== undefined && query.symbolKinds.includes(record.symbolKind);
}
