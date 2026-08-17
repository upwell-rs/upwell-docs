export type MatchRanges = readonly (readonly [number, number])[];

export interface FieldMatch {
	readonly score: number;
	readonly ranges: MatchRanges;
}

export function terms(query: string): string[] {
	return query.trim().toLowerCase().split(/\s+/).filter((term) => term !== '');
}

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

function matchOne(field: string, haystack: string, term: string): FieldMatch | undefined {
	const direct = substring(field, haystack, term);

	return direct ?? subsequence(field, haystack, term);
}

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

	return { score: Math.min(weakest * 1.1, 0.95), ranges: merge(ranges) };
}

function coverage(field: string, length: number): number {
	return length / Math.max(field.length, 1);
}

function substring(field: string, haystack: string, term: string): FieldMatch | undefined {
	const at = haystack.indexOf(term);

	if (at === -1) {
		return undefined;
	}

	const ranges: MatchRanges = [[at, at + term.length]];

	if (haystack === term) {
		return { score: 1, ranges };
	}

	const anchored = at === 0 || isBoundary(haystack, at);
	const base = anchored ? 0.75 : 0.5;

	return { score: base + coverage(field, term.length) * 0.2, ranges };
}

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
	const tightness = term.length / span;
	const anchoring = onBoundary / term.length;
	const score = 0.45 * tightness + 0.25 * anchoring + 0.1 * coverage(field, term.length);

	if (score < 0.2) {
		return undefined;
	}

	return { score: Math.min(score, 0.7), ranges: merge(positions.map((at) => [at, at + 1])) };
}

function findBoundary(haystack: string, character: string, from: number): number | undefined {
	for (let at = from; at < haystack.length; at += 1) {
		if (haystack[at] === character && (at === 0 || isBoundary(haystack, at))) {
			return at;
		}
	}

	return undefined;
}

function isBoundary(haystack: string, at: number): boolean {
	return !/[a-z0-9]/.test(haystack[at - 1]);
}

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

export interface Segment {
	readonly text: string;
	readonly match: boolean;
}

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
