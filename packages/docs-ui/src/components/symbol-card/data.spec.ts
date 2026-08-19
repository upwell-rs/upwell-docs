import { describe, expect, it } from 'vitest';

import {
	readDocumentedSymbolCardData,
	readExternalSymbolCardData,
	readLocalSymbolCardData,
	readSymbolCardData,
	readVariableSymbolCardData
} from './data.ts';

function target(dataset: DOMStringMap, href?: string): HTMLElement {
	return {
		dataset,
		getAttribute: (name: string) => name === 'href' ? href ?? null : null
	} as HTMLElement;
}

describe('symbol card metadata', () => {
	it('decodes a documented symbol and prefers its documentation destination', () => {
		const element = target({
			symbol: 'upwell::App',
			symbolKind: 'struct',
			symbolSignature: 'pub struct App',
			symbolDoc: 'Application runtime.',
			symbolFeature: 'runtime',
			symbolDeprecated: 'Use Server.',
			symbolSource: '/src/app.rs#L12',
			symbolDocs: '/symbols/upwell/App',
			symbolDocsTitle: 'App documentation'
		}, '/src/app.rs#L12');

		expect(readDocumentedSymbolCardData(element)).toEqual({
			path: 'upwell::App',
			kind: 'struct',
			signature: 'pub struct App',
			summary: 'Application runtime.',
			feature: 'runtime',
			deprecated: 'Use Server.',
			sourceHref: '/src/app.rs#L12',
			documentedAt: { href: '/symbols/upwell/App', title: 'App documentation' }
		});
	});

	it('uses an article symbol anchor as the documented destination', () => {
		const element = target({ symbol: 'upwell::serve', symbolKind: 'function' }, '/symbols/serve');

		expect(readSymbolCardData(element)?.documentedAt).toEqual({
			href: '/symbols/serve',
			title: 'Documentation'
		});
	});

	it('does not treat a source line href as documentation without metadata', () => {
		const element = target({ symbol: 'upwell::serve', symbolKind: 'function' }, '/src/app.rs#L12');

		expect(readDocumentedSymbolCardData(element)?.documentedAt).toBeUndefined();
	});

	it('decodes local variables with internal and external type destinations', () => {
		const internal = target({
			variable: 'app',
			variableType: 'upwell::App',
			variableKind: 'struct',
			variableDoc: 'Application runtime.',
			variableHref: '/symbols/upwell/App'
		});
		const external = target({
			variable: 'message',
			variableType: 'std::string::String',
			variableCrate: 'std',
			variableHref: 'https://doc.rust-lang.org/std/string/struct.String.html'
		});

		expect(readVariableSymbolCardData(internal)).toMatchObject({
			path: 'upwell::App',
			variable: 'app',
			documentedAt: { href: '/symbols/upwell/App', title: 'App' },
			sourceHref: undefined
		});
		expect(readVariableSymbolCardData(external)).toMatchObject({
			path: 'std::string::String',
			variable: 'message',
			externalCrate: 'std',
			documentedAt: undefined,
			sourceHref: 'https://doc.rust-lang.org/std/string/struct.String.html'
		});
	});

	it('decodes symbols declared in the current example', () => {
		const element = target({
			local: 'Greeter',
			localKind: 'struct',
			localSignature: 'struct Greeter',
			localDoc: 'Greets a user.',
			localLine: '7'
		});

		expect(readLocalSymbolCardData(element)).toEqual({
			path: 'Greeter',
			kind: 'struct',
			signature: 'struct Greeter',
			summary: 'Greets a user.',
			definedInPage: 'Defined on line 7 of this example'
		});
	});

	it('decodes external symbol metadata and selects the matching reader', () => {
		const element = target({
			external: 'std::sync::Arc',
			externalKind: 'struct',
			externalCrate: 'std',
			externalDoc: 'A thread-safe reference-counting pointer.',
			externalSignature: 'pub struct Arc<T>'
		}, 'https://doc.rust-lang.org/std/sync/struct.Arc.html');
		const expected = {
			path: 'std::sync::Arc',
			kind: 'struct',
			externalCrate: 'std',
			summary: 'A thread-safe reference-counting pointer.',
			signature: 'pub struct Arc<T>',
			sourceHref: 'https://doc.rust-lang.org/std/sync/struct.Arc.html'
		};

		expect(readExternalSymbolCardData(element)).toEqual(expected);
		expect(readSymbolCardData(element)).toEqual(expected);
		expect(readSymbolCardData(target({}))).toBeUndefined();
	});
});
