export interface SearchRecord {
	readonly href: string;
	readonly title: string;
	readonly kind: 'guide' | 'symbol-page' | 'symbol';
	readonly symbolKind?: string;
	readonly detail?: string;
	readonly text?: string;
	readonly headings?: readonly { readonly id: string; readonly text: string }[];
	readonly signature?: string;
	readonly external?: boolean;
}

/** The serialisable response served by a versioned static search endpoint. */
export interface SearchIndexResponse {
	readonly version: string;
	readonly records: readonly SearchRecord[];
	readonly degraded: boolean;
}
