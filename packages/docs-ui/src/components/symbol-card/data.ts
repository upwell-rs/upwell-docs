export interface SymbolCardData {
	path: string;
	kind: string;
	signature?: string;
	/** First paragraph of the symbol's `///` comment. */
	summary?: string;
	feature?: string;
	deprecated?: string;
	sourceHref?: string;
	/** Destination from the defined references, when the symbol has one. */
	documentedAt?: { href: string; title: string };
	/** The local variable whose type the card describes. */
	variable?: string;
	/** Where a symbol declared by the current snippet is defined. */
	definedInPage?: string;
	/** The crate owning an external symbol or variable type. */
	externalCrate?: string;
}

export const DOCUMENTED_SYMBOL_SELECTOR = '[data-symbol]';
export const VARIABLE_SYMBOL_SELECTOR = '[data-variable]';
export const LOCAL_SYMBOL_SELECTOR = '[data-local]';
export const EXTERNAL_SYMBOL_SELECTOR = '[data-external]';
export const DOCUMENTED_OR_EXTERNAL_SYMBOL_SELECTOR = `${DOCUMENTED_SYMBOL_SELECTOR}, ${EXTERNAL_SYMBOL_SELECTOR}`;
export const SYMBOL_CARD_TARGET_SELECTOR = [
	DOCUMENTED_SYMBOL_SELECTOR,
	VARIABLE_SYMBOL_SELECTOR,
	LOCAL_SYMBOL_SELECTOR,
	EXTERNAL_SYMBOL_SELECTOR
].join(', ');

export function readVariableSymbolCardData(target: HTMLElement): SymbolCardData | undefined {
	const type = target.dataset.variableType;

	if (!type) {
		return undefined;
	}

	const href = target.dataset.variableHref;
	const externalCrate = target.dataset.variableCrate;

	return {
		path: type,
		kind: target.dataset.variableKind ?? 'item',
		summary: target.dataset.variableDoc,
		variable: target.dataset.variable,
		externalCrate,
		documentedAt: href && !externalCrate ? { href, title: type.split('::').pop() ?? type } : undefined,
		sourceHref: externalCrate ? href : undefined
	};
}

export function readDocumentedSymbolCardData(
	target: HTMLElement,
	documentedHref = target.dataset.symbolDocs
): SymbolCardData | undefined {
	const path = target.dataset.symbol;

	if (!path) {
		return undefined;
	}

	return {
		path,
		kind: target.dataset.symbolKind ?? 'item',
		signature: target.dataset.symbolSignature,
		summary: target.dataset.symbolDoc,
		feature: target.dataset.symbolFeature,
		deprecated: target.dataset.symbolDeprecated,
		sourceHref: target.dataset.symbolSource,
		documentedAt: documentedHref
			? { href: documentedHref, title: target.dataset.symbolDocsTitle ?? 'Documentation' }
			: undefined
	};
}

export function readLocalSymbolCardData(target: HTMLElement): SymbolCardData | undefined {
	const name = target.dataset.local;

	if (!name) {
		return undefined;
	}

	return {
		path: name,
		kind: target.dataset.localKind ?? 'item',
		signature: target.dataset.localSignature,
		summary: target.dataset.localDoc,
		definedInPage: `Defined on line ${target.dataset.localLine} of this example`
	};
}

export function readExternalSymbolCardData(target: HTMLElement): SymbolCardData | undefined {
	const path = target.dataset.external;

	if (!path) {
		return undefined;
	}

	return {
		path,
		kind: target.dataset.externalKind ?? 'item',
		externalCrate: target.dataset.externalCrate,
		summary: target.dataset.externalDoc,
		signature: target.dataset.externalSignature,
		sourceHref: target.getAttribute('href') ?? undefined
	};
}

export function readSymbolCardData(target: HTMLElement): SymbolCardData | undefined {
	return readDocumentedSymbolCardData(target, target.dataset.symbolDocs ?? target.getAttribute('href') ?? undefined)
		?? readVariableSymbolCardData(target)
		?? readLocalSymbolCardData(target)
		?? readExternalSymbolCardData(target);
}

export function readSourceSymbolCardData(target: HTMLElement): SymbolCardData | undefined {
	return readDocumentedSymbolCardData(target) ?? readExternalSymbolCardData(target);
}
