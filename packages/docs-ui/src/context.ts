import { getContext, setContext } from 'svelte';

import type { DocsNotifier, DocsVersion, SymbolInfo } from './types.ts';

const VERSION = Symbol('upwell-docs-version');
const SYMBOL = Symbol('upwell-docs-symbol');
const NOTIFIER = Symbol('upwell-docs-notifier');

export function setDocsVersion(version: () => DocsVersion): void {
	setContext(VERSION, version);
}

export function getDocsVersion(): DocsVersion | undefined {
	return getContext<(() => DocsVersion) | undefined>(VERSION)?.();
}

export function setSymbolInfo(symbol: () => SymbolInfo): void {
	setContext(SYMBOL, symbol);
}

export function getSymbolInfo(): SymbolInfo {
	const symbol = getContext<(() => SymbolInfo) | undefined>(SYMBOL);

	if (!symbol) {
		throw new Error('No symbol in context. Symbol components must be rendered under a symbol provider.');
	}

	return symbol();
}

export function setDocsNotifier(notifier: DocsNotifier): void {
	setContext(NOTIFIER, notifier);
}

export function getDocsNotifier(): DocsNotifier | undefined {
	return getContext<DocsNotifier | undefined>(NOTIFIER);
}
