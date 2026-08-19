import { DOCUMENTED_OR_EXTERNAL_SYMBOL_SELECTOR, readSourceSymbolCardData } from './data.ts';
import { createSymbolCardInteractions, type SymbolCardInteractionOptions } from './interactions.ts';

export type { ActiveSymbolCard } from './interactions.ts';

export function createSourceSymbolCardInteractions(
	options: Omit<SymbolCardInteractionOptions, 'read' | 'selector'>
) {
	return createSymbolCardInteractions({
		...options,
		selector: DOCUMENTED_OR_EXTERNAL_SYMBOL_SELECTOR,
		read: readSourceSymbolCardData
	});
}
