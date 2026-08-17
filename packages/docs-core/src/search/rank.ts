import { matchField, type MatchRanges, terms } from './match.ts';
import { admits, parseQuery, type Query } from './query.ts';

export interface SearchRecord {
	readonly href: string;
	readonly title: string;
	readonly kind: 'guide' | 'symbol-page' | 'symbol';
	readonly symbolKind?: string;
	readonly detail?: string;
	readonly text?: string;
	readonly headings?: readonly { id: string; text: string }[];
	readonly signature?: string;
	readonly external?: boolean;
}

export interface SearchResult {
	readonly record: SearchRecord;
	readonly score: number;
	readonly href: string;
	readonly heading?: string;
	readonly excerpt?: string;
	readonly titleRanges?: MatchRanges;
	readonly detailRanges?: MatchRanges;
	readonly excerptRanges?: MatchRanges;
}

const WEIGHT = { title: 1000, detail: 300, heading: 750, body: 60 } as const;
const KIND_BONUS: Record<SearchRecord['kind'], number> = { guide: 12, 'symbol-page': 6, symbol: 0 };
const INCIDENTAL_KINDS = new Set(['variant', 'struct_field', 'assoc_const', 'assoc_type']);
const INCIDENTAL_FACTOR = 0.3;
const MEMBER_KINDS = new Set(['method', 'assoc_fn']);
const MEMBER_FACTOR = 0.6;
const EXCERPT_RADIUS = 60;

export function search(records: readonly SearchRecord[], raw: string, limit = 20): SearchResult[] {
	const query = parseQuery(raw);
	const needles = terms(query.text);
	const filtered = records.filter((record) => admits(query, record));

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

	return results.sort((a, b) => b.score - a.score || a.record.title.length - b.record.title.length).slice(0, limit);
}

function browse(records: readonly SearchRecord[], limit: number): SearchResult[] {
	return [...records].sort((a, b) => a.title.localeCompare(b.title)).slice(0, limit).map((record) => ({ record, score: 0, href: record.href }));
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

	return { record, score: total * weight(record, query) + KIND_BONUS[record.kind], href: heading ? `${record.href}#${heading.id}` : record.href, heading: heading?.text, titleRanges: title?.ranges, detailRanges: detail?.ranges, ...excerptFor(record, body?.ranges) };
}

function weight(record: SearchRecord, query: Query): number {
	if (query.symbolKinds.length > 0 || !record.symbolKind) {
		return 1;
	}

	if (INCIDENTAL_KINDS.has(record.symbolKind)) {
		return INCIDENTAL_FACTOR;
	}

	return MEMBER_KINDS.has(record.symbolKind) ? MEMBER_FACTOR : 1;
}

function findHeading(record: SearchRecord, needles: readonly string[]): { id: string; text: string; match: { score: number } } | undefined {
	let best: { id: string; text: string; match: { score: number } } | undefined;

	for (const heading of record.headings ?? []) {
		const found = matchField(heading.text, needles);

		if (found && (!best || found.score > best.match.score)) {
			best = { id: heading.id, text: heading.text, match: found };
		}
	}

	return best;
}

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
	const rebased = ranges.filter(([at, end]) => at >= offset && end <= to).map(([at, end]) => [at - offset + prefix.length, end - offset + prefix.length] as const);

	return { excerpt: `${prefix}${trimmed.trimEnd()}${to < text.length ? '…' : ''}`, excerptRanges: rebased };
}
