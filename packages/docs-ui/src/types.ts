export interface DocsVersion {
	readonly id: string;
	readonly label: string;
}

export interface DocsTopic {
	readonly id: string;
	readonly label: string;
	readonly description: string;
}

export type NavigationNode =
	| {
		readonly type: 'group';
		readonly id: string;
		readonly label: string;
		readonly kind: 'guide' | 'reference';
		readonly defaultOpen: boolean;
		readonly children: readonly NavigationNode[];
	}
	| {
		readonly type: 'page';
		readonly id: string;
		readonly title: string;
		readonly href: string;
		readonly reference: boolean;
	};

export interface DocSummary {
	readonly slug: string;
	readonly title: string;
}

export interface DocHeading {
	readonly id: string;
	readonly text: string;
	readonly depth: 2 | 3;
}

export interface SymbolLink {
	readonly path: string;
	readonly name: string;
	readonly href: string | null;
}

export interface SymbolMember {
	readonly name: string;
	readonly kind: string;
	readonly signature: string | null;
	readonly doc: string | null;
	readonly deprecated: boolean;
	readonly sourceHref: string | null;
}

export interface SymbolInfo {
	readonly path: string;
	readonly canonicalPath: string;
	readonly name: string;
	readonly kind: string;
	readonly procMacro: { readonly kind: 'bang' | 'attribute' | 'derive'; readonly helpers: readonly string[] } | null;
	readonly crate: string;
	readonly signature: string | null;
	readonly doc: string | null;
	readonly feature: string | null;
	readonly deprecation: { readonly since: string | null; readonly note: string | null } | null;
	readonly sourceHref: string | null;
	readonly source: { readonly file: string; readonly line: number } | null;
	readonly implementations: readonly string[];
	readonly implementors: readonly SymbolLink[];
	readonly members: readonly SymbolMember[];
}

export interface DocsNotifier {
	copied(what: string): void;
	copyFailed(): void;
}
