/**
 * Query syntax: `struct:Component`, `doc:routing`, `trait:`.
 *
 * An index that is mostly symbols needs a way to say *which kind* of thing is wanted. Without it a
 * reader looking for the `Component` trait wades through a struct, an enum variant and a guide that
 * all share the name — and the ranking cannot know which they meant, because nothing they typed
 * said so.
 *
 * The prefixes are the words a Rust developer already uses for these things, so the syntax needs no
 * explaining: `struct`, `enum`, `trait`, `fn`, `macro`, `mod`, `type`, `const`. Two more cover the
 * kinds of *page*: `doc` for authored guides and `symbol` for reference pages.
 *
 * An unrecognised prefix is **not** treated as a filter. `HashMap::new` and `Result:` are ordinary
 * text, and a query that silently matched nothing because a colon was read as syntax would be a
 * worse failure than not supporting the shorthand at all.
 */

/** What a parsed query asks for. */
export interface Query {
	/** The text to match. Empty when the reader has typed only a filter. */
	readonly text: string;
	/**
	 * Symbol kinds to keep, as they appear in the index. Empty means no kind filter.
	 *
	 * Several because one word can cover several index kinds — `fn` covers both free functions and
	 * associated ones.
	 */
	readonly symbolKinds: readonly string[];
	/** Record kinds to keep. Empty means no record filter. */
	readonly recordKinds: readonly ('guide' | 'symbol-page' | 'symbol')[];
	/** The filter word as written, for showing the reader what is in effect. */
	readonly filter: string | null;
}

/**
 * Filter words and what they select.
 *
 * `doc` selects authored guides; `symbol` selects hand-written reference pages, which is a different
 * thing from a bare framework symbol and worth being able to ask for separately.
 */
const FILTERS: Record<string, Pick<Query, 'symbolKinds' | 'recordKinds'>> = {
	// A kind filter selects by *symbol* kind and says nothing about whether the symbol happens to
	// have a hand-written page. Constraining the record kind as well would hide exactly the best
	// result: `macro:component` would drop the page written about that macro.
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

/** Every filter word, for offering them to the reader. */
export const FILTER_WORDS: readonly string[] = Object.keys(FILTERS);

const PREFIX = /^([a-z]+):(.*)$/s;

/** Parses a raw query string. */
export function parseQuery(raw: string): Query {
	const trimmed = raw.trim();
	const match = PREFIX.exec(trimmed);
	const filter = match ? FILTERS[match[1]] : undefined;

	if (!match || !filter) {
		// Not a filter — including `HashMap::new`, where the colon is part of a path.
		return { text: trimmed, symbolKinds: [], recordKinds: [], filter: null };
	}

	return { text: match[2].trim(), symbolKinds: filter.symbolKinds, recordKinds: filter.recordKinds, filter: match[1] };
}

/** Whether a record survives a query's filters. */
export function admits(query: Query, record: { kind: string; symbolKind?: string }): boolean {
	if (query.recordKinds.length > 0 && !query.recordKinds.includes(record.kind as 'guide')) {
		return false;
	}

	if (query.symbolKinds.length === 0) {
		return true;
	}

	return record.symbolKind !== undefined && query.symbolKinds.includes(record.symbolKind);
}
