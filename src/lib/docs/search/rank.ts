/**
 * Ranking for documentation search.
 *
 * Deliberately not a general text-search engine. Documentation queries are short — a type name, a
 * couple of words — and the corpus is small enough to score exhaustively, so the work is in
 * *ordering* rather than in retrieval. A relevance model that cannot be predicted is worse here
 * than one that is slightly cruder: a reader who types `HttpRequest` must get `HttpRequest` first,
 * every time.
 *
 * The fields, strongest first:
 *
 * 1. the title
 * 2. the symbol path or description
 * 3. a heading — which also tells the result *where* to point
 * 4. the body
 *
 * Within a field, `match.ts` decides how good the match is: an exact hit outscores a prefix, which
 * outscores a word boundary, which outscores a loose subsequence. Keeping "which field" and "how
 * well" apart is what lets multi-word and fuzzy matching apply everywhere at once without a
 * combinatorial pile of scoring rules.
 *
 * Guides outrank symbols at equal strength, because a reader who has typed a word rather than a
 * path is more likely to want prose than a declaration.
 *
 * A query may narrow by kind first — `struct:Component`, `doc:routing` — which `query.ts` parses.
 * A filter with no text lists everything of that kind, which is how a reader browses rather than
 * searches.
 */

import { matchField, type MatchRanges, terms } from './match.ts';
import { admits, parseQuery, type Query } from './query.ts';

/** What search matches against. Mirrors the server-built record, minus anything ranking ignores. */
export interface SearchRecord {
	readonly href: string;
	readonly title: string;
	readonly kind: 'guide' | 'symbol-page' | 'symbol';
	/** For a symbol, what it is — a struct, a variant, a field. Absent for pages. */
	readonly symbolKind?: string;
	readonly detail?: string;
	readonly text?: string;
	readonly headings?: readonly { id: string; text: string }[];
	/** Shown in place of a destination, for a symbol with no page of its own. */
	readonly signature?: string;
	/** True when following the result leaves the site. */
	readonly external?: boolean;
}

export interface SearchResult {
	readonly record: SearchRecord;
	readonly score: number;
	/** Where to send the reader: the page, or an anchor within it when a heading matched. */
	readonly href: string;
	/** The heading that matched, when one did. */
	readonly heading?: string;
	/** A short piece of body text around the match, for context. */
	readonly excerpt?: string;
	/** Where the query matched the title, for highlighting. */
	readonly titleRanges?: MatchRanges;
	/** Where the query matched the detail line, for highlighting. */
	readonly detailRanges?: MatchRanges;
	/** Where the query matched within `excerpt` — indexed into the excerpt, not the body. */
	readonly excerptRanges?: MatchRanges;
}

/**
 * What a match in each field is worth.
 *
 * Multiplied by the 0-to-1 quality `match.ts` returns, so an exact title match scores 1000 and a
 * loose subsequence in the same title scores a few hundred — ordered below an exact match on a
 * weaker field, which is the intent.
 */
const WEIGHT = {
	title: 1000,
	detail: 300,
	/**
	 * A heading match means the page has a whole *section* on the query, which is a strong signal —
	 * strong enough to outrank a symbol that merely contains the word in a longer name.
	 *
	 * Weighted this highly deliberately. Once members are in the index the corpus contains thousands
	 * of long identifiers, and a query like `scopes` matches `validate_scopes`, `ScopeRegistry` and
	 * `scopes_for` on a word boundary — each of which is a partial title match and none of which is
	 * what someone typing a bare concept wants. The page with a section named exactly that is.
	 */
	heading: 750,
	body: 60
} as const;

/** Guides edge out reference material when nothing else separates them. */
const KIND_BONUS: Record<SearchRecord['kind'], number> = {
	guide: 12,
	'symbol-page': 6,
	symbol: 0
};

/**
 * Symbol kinds a reader almost never searches for directly.
 *
 * An enum variant or a struct field is reached through the type that owns it, and its bare name is
 * often a common word — so one matching exactly would otherwise outrank the guide that explains the
 * concept. Weighting them down keeps them findable without letting them lead.
 */
const INCIDENTAL_KINDS = new Set(['variant', 'struct_field', 'assoc_const', 'assoc_type']);

const INCIDENTAL_FACTOR = 0.3;

/**
 * Members are reached through their owner, so they rank below it — but well above a variant.
 *
 * A reader searching `serve` may well want `App::serve`; a reader searching `App` wants the type,
 * not its forty methods filling the list ahead of it.
 */
const MEMBER_KINDS = new Set(['method', 'assoc_fn']);

const MEMBER_FACTOR = 0.6;

/** Characters around a body match to show as context. */
const EXCERPT_RADIUS = 60;

/**
 * Scores and orders records against a query.
 *
 * A record that matches nothing scores zero and is dropped, so an empty result set is a real
 * answer rather than the whole corpus in arbitrary order.
 */
export function search(records: readonly SearchRecord[], raw: string, limit = 20): SearchResult[] {
	const query = parseQuery(raw);
	const needles = terms(query.text);
	const filtered = records.filter((record) => admits(query, record));

	// A bare filter (`struct:`) lists its kind rather than nothing: with no text to match there is
	// nothing to rank, so this is browsing, and alphabetical is the only order that makes sense.
	if (needles.length === 0) {
		return query.filter ? browse(filtered, limit) : [];
	}

	const results: SearchResult[] = [];

	for (const record of filtered) {
		const scored = score(record, needles, query);

		if (scored) {
			results.push(scored);
		}
	}

	return results
		.sort((a, b) => b.score - a.score || a.record.title.length - b.record.title.length)
		.slice(0, limit);
}

/** Everything of a kind, in name order. */
function browse(records: readonly SearchRecord[], limit: number): SearchResult[] {
	return [...records]
		.sort((a, b) => a.title.localeCompare(b.title))
		.slice(0, limit)
		.map((record) => ({ record, score: 0, href: record.href }));
}

function score(record: SearchRecord, needles: readonly string[], query: Query): SearchResult | undefined {
	const title = matchField(record.title, needles);
	const detail = record.detail ? matchField(record.detail, needles) : undefined;
	const heading = findHeading(record, needles);
	const body = record.text ? matchField(record.text, needles) : undefined;

	let total = (title?.score ?? 0) * WEIGHT.title + (detail?.score ?? 0) * WEIGHT.detail;

	total += (heading?.match.score ?? 0) * WEIGHT.heading + (body?.score ?? 0) * WEIGHT.body;

	if (total === 0) {
		return undefined;
	}

	return {
		record,
		score: total * weight(record, query) + KIND_BONUS[record.kind],
		// A matching heading is a better destination than the top of the page.
		href: heading ? `${record.href}#${heading.id}` : record.href,
		heading: heading?.text,
		titleRanges: title?.ranges,
		detailRanges: detail?.ranges,
		...excerptFor(record, body?.ranges)
	};
}

/**
 * How much a record's kind discounts its score.
 *
 * A reader who asked for a kind has already said what they want, so nothing of that kind is
 * incidental to them any more.
 */
function weight(record: SearchRecord, query: Query): number {
	if (query.symbolKinds.length > 0 || !record.symbolKind) {
		return 1;
	}

	if (INCIDENTAL_KINDS.has(record.symbolKind)) {
		return INCIDENTAL_FACTOR;
	}

	return MEMBER_KINDS.has(record.symbolKind) ? MEMBER_FACTOR : 1;
}

/** The best-matching heading on a page, which is where the result should point. */
function findHeading(
	record: SearchRecord,
	needles: readonly string[]
): { id: string; text: string; match: { score: number } } | undefined {
	let best: { id: string; text: string; match: { score: number } } | undefined;

	for (const heading of record.headings ?? []) {
		const found = matchField(heading.text, needles);

		if (found && (!best || found.score > best.match.score)) {
			best = { id: heading.id, text: heading.text, match: found };
		}
	}

	return best;
}

/**
 * A window of body text around the first match, with the match's ranges rebased onto it.
 *
 * Rebasing rather than re-matching: the excerpt is a slice of the text that was scored, so the
 * ranges are already known and shifting them is exact. Matching again could disagree with the score.
 */
function excerptFor(record: SearchRecord, ranges: MatchRanges | undefined): { excerpt?: string; excerptRanges?: MatchRanges } {
	if (!record.text || !ranges || ranges.length === 0) {
		return {};
	}

	const text = record.text;
	const [start] = ranges[0];
	const from = Math.max(0, start - EXCERPT_RADIUS);
	const to = Math.min(text.length, ranges[0][1] + EXCERPT_RADIUS);
	const slice = text.slice(from, to);
	const trimmed = slice.trimStart();
	const offset = from + (slice.length - trimmed.length);
	const prefix = from > 0 ? '…' : '';

	const rebased = ranges
		.filter(([at, end]) => at >= offset && end <= to)
		.map(([at, end]) => [at - offset + prefix.length, end - offset + prefix.length] as const);

	return {
		excerpt: `${prefix}${trimmed.trimEnd()}${to < text.length ? '…' : ''}`,
		excerptRanges: rebased
	};
}
