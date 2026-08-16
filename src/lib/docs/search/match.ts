/**
 * Matching a query against one field, and saying *where* it matched.
 *
 * Split out from ranking because these are two different jobs. Ranking decides which result wins;
 * this decides whether a field matches at all, how well, and which characters to highlight — and the
 * highlight has to come from the same pass that scored, or the result shows emphasis on characters
 * that had nothing to do with why it was found.
 *
 * Three strategies, tried strongest first:
 *
 * 1. **substring** — the query appears as written. `httprequest` in `HttpRequest`.
 * 2. **all terms** — every whitespace-separated term appears somewhere. `http request` finds
 *    `HttpRequest`, which a single-substring match cannot: the space is not in the identifier.
 * 3. **subsequence** — the query's characters appear in order. `hreq` finds `HttpRequest`.
 *
 * The third is the only fuzzy one, and it is kept honest by two rules that matter more than the
 * algorithm: matches at a word boundary score far above matches inside a word, and a match whose
 * characters are scattered across the whole string scores near zero. Without those, fuzzy matching
 * finds *everything* — every identifier contains the letters of every short query somewhere — and a
 * search that always returns results is indistinguishable from one that never works.
 */

/** Where a match landed, as character ranges into the field, for highlighting. */
export type MatchRanges = readonly (readonly [number, number])[];

export interface FieldMatch {
	/** 0 to 1, where 1 is an exact match of the whole field. */
	readonly score: number;
	readonly ranges: MatchRanges;
}

/** Splits a query into terms. An empty query has none, which callers treat as "no text to match". */
export function terms(query: string): string[] {
	return query.trim().toLowerCase().split(/\s+/).filter((term) => term !== '');
}

/**
 * Matches a query against one field.
 *
 * `field` is matched case-insensitively but ranges index into it as given, so the caller can
 * highlight the original text rather than a lowercased copy.
 */
export function matchField(field: string, query: readonly string[]): FieldMatch | undefined {
	if (query.length === 0) {
		return undefined;
	}

	const haystack = field.toLowerCase();

	if (query.length === 1) {
		return matchOne(field, haystack, query[0]);
	}

	return matchAllTerms(field, haystack, query);
}

/** A single term, by substring first and subsequence second. */
function matchOne(field: string, haystack: string, term: string): FieldMatch | undefined {
	const direct = substring(field, haystack, term);

	return direct ?? subsequence(field, haystack, term);
}

/**
 * Every term must appear, and the score is the weakest of them.
 *
 * The weakest rather than the average: a query of two terms where one barely matches is a weak
 * result, and averaging would let a strong first term carry a term that hardly matched at all.
 */
function matchAllTerms(field: string, haystack: string, query: readonly string[]): FieldMatch | undefined {
	const ranges: [number, number][] = [];
	let weakest = 1;

	for (const term of query) {
		const found = matchOne(field, haystack, term);

		if (!found) {
			return undefined;
		}

		ranges.push(...(found.ranges as [number, number][]));
		weakest = Math.min(weakest, found.score);
	}

	// Several terms matching is better evidence than one, but never enough to beat an exact hit.
	return { score: Math.min(weakest * 1.1, 0.95), ranges: merge(ranges) };
}

/** How much of the field the match covers, which is what separates a hit from a coincidence. */
function coverage(field: string, length: number): number {
	return length / Math.max(field.length, 1);
}

/** An exact substring match, scored by where it starts and how much of the field it covers. */
function substring(field: string, haystack: string, term: string): FieldMatch | undefined {
	const at = haystack.indexOf(term);

	if (at === -1) {
		return undefined;
	}

	const ranges: MatchRanges = [[at, at + term.length]];

	if (haystack === term) {
		return { score: 1, ranges };
	}

	// A match at the start, or at the start of a word within the field, is what a reader means far
	// more often than one buried inside a longer identifier.
	const anchored = at === 0 || isBoundary(haystack, at);
	const base = anchored ? 0.75 : 0.5;

	return { score: base + coverage(field, term.length) * 0.2, ranges };
}

/**
 * The query's characters, in order but not adjacent.
 *
 * Every matched character is placed as early as it can be, except that a character which can land on
 * a word boundary takes it. That is what makes `arq` prefer `AxumRequestQueue` over the first three
 * scattered letters of something longer, and it is the difference between fuzzy matching that feels
 * deliberate and fuzzy matching that feels random.
 */
function subsequence(field: string, haystack: string, term: string): FieldMatch | undefined {
	const positions: number[] = [];
	let cursor = 0;

	for (const character of term) {
		const at = haystack.indexOf(character, cursor);

		if (at === -1) {
			return undefined;
		}

		const boundary = findBoundary(haystack, character, at);

		positions.push(boundary ?? at);
		cursor = (boundary ?? at) + 1;
	}

	const span = positions[positions.length - 1] - positions[0] + 1;
	const onBoundary = positions.filter((at) => at === 0 || isBoundary(haystack, at)).length;

	// Tightness is how close the matched characters are to being adjacent; a query whose letters are
	// spread across the whole name is a coincidence, not a match.
	const tightness = term.length / span;
	const anchoring = onBoundary / term.length;
	const score = 0.45 * tightness + 0.25 * anchoring + 0.1 * coverage(field, term.length);

	// Below this a "match" is letters that happen to appear in order, which every long name contains
	// for every short query. Returning nothing is the correct answer.
	if (score < 0.2) {
		return undefined;
	}

	return { score: Math.min(score, 0.7), ranges: merge(positions.map((at) => [at, at + 1])) };
}

/** The next place this character starts a word, if that is close enough to be worth preferring. */
function findBoundary(haystack: string, character: string, from: number): number | undefined {
	for (let at = from; at < haystack.length; at += 1) {
		if (haystack[at] === character && (at === 0 || isBoundary(haystack, at))) {
			return at;
		}
	}

	return undefined;
}

/**
 * Whether a position begins a word.
 *
 * Both conventions count, because both appear in the same query: `_` and `::` separate words in Rust
 * paths, and a capital begins one inside a camel-case identifier. The haystack is lowercased by the
 * time it arrives, so capitals are detected from the original — which is why this takes the raw
 * string's separators rather than a case test.
 */
function isBoundary(haystack: string, at: number): boolean {
	return !/[a-z0-9]/.test(haystack[at - 1]);
}

/** Merges overlapping or adjacent ranges, so highlighting emits one span per run. */
function merge(ranges: readonly (readonly [number, number])[]): MatchRanges {
	const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
	const merged: [number, number][] = [];

	for (const [start, end] of sorted) {
		const last = merged[merged.length - 1];

		if (last && start <= last[1]) {
			last[1] = Math.max(last[1], end);

			continue;
		}

		merged.push([start, end]);
	}

	return merged;
}

/** One piece of a field, marked as matched or not, ready to render. */
export interface Segment {
	readonly text: string;
	readonly match: boolean;
}

/**
 * Cuts a field into matched and unmatched pieces.
 *
 * Returned as data rather than as HTML: the caller renders it with Svelte's own escaping, so nothing
 * here has to be trusted to escape a symbol name correctly.
 */
export function segments(field: string, ranges: MatchRanges): Segment[] {
	const pieces: Segment[] = [];
	let at = 0;

	for (const [start, end] of ranges) {
		if (start > at) {
			pieces.push({ text: field.slice(at, start), match: false });
		}

		pieces.push({ text: field.slice(start, end), match: true });
		at = end;
	}

	if (at < field.length) {
		pieces.push({ text: field.slice(at), match: false });
	}

	return pieces;
}
