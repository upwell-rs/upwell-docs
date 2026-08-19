export interface SymbolRecord {
	readonly path: string;
	readonly name: string;
	readonly crate: string;
	readonly kind: string;
	readonly summary: string | null;
	readonly href: string;
	readonly authored: boolean;
}

export function filterSymbolRecords(
	records: readonly SymbolRecord[],
	query: string,
	crate: string
): readonly SymbolRecord[] {
	const wanted = query.trim().toLowerCase();

	return records.filter((record) =>
		(crate === 'all' || record.crate === crate) &&
		(!wanted || record.path.toLowerCase().includes(wanted) || record.summary?.toLowerCase().includes(wanted))
	);
}
