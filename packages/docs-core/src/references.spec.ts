import { describe, expect, it } from 'vitest';

import { guideFragment, guideSlug, sourceCrate, sourcePath, symbolPath } from './references.ts';

describe('authoring reference paths', () => {
	it('normalizes authored guide, symbol, source, and crate separators', () => {
		expect(guideSlug('/getting-started/setup/')).toBe('getting-started/setup');
		expect(symbolPath('::framework::http::Controller::')).toBe('framework/http/Controller');
		expect(sourcePath('/crates/app/src/odd#name.rs/')).toBe('crates/app/src/odd#name.rs');
		expect(sourceCrate('/framework-extra/')).toBe('framework-extra');
	});

	it.each(['#fragment', 'guide?mode=full', 'bad%2', 'two words', '../secrets', 'path\\file'])(
		'rejects invalid guide slug %s',
		(value) => expect(() => guideSlug(value)).toThrow('Invalid documentation guide slug')
	);

	it('normalizes valid guide fragments', () => {
		expect(guideFragment('validate-one-application')).toBe('validate-one-application');
		expect(guideFragment('#automate-validation')).toBe('automate-validation');
	});

	it.each(['', '#', 'two words', 'heading?', 'heading#nested', 'bad%2', '../heading', 'heading\\child'])(
		'rejects invalid guide fragment %s',
		(value) => expect(() => guideFragment(value)).toThrow('Invalid documentation guide fragment')
	);

	it.each(['framework::Type#member', 'framework::Type?', 'framework::Bad%2', 'framework::Two Words', 'framework::..::Secret', 'framework\\Type'])(
		'rejects invalid symbol path %s',
		(value) => expect(() => symbolPath(value)).toThrow('Invalid documentation symbol path')
	);

	it.each(['framework#extra', 'framework?extra', 'framework%2', 'framework extra', '../framework', 'framework\\extra', 'framework/extra'])(
		'rejects invalid source crate %s',
		(value) => expect(() => sourceCrate(value)).toThrow('Invalid documentation source crate')
	);

	it.each(['../secrets', 'src/./lib.rs', 'src//lib.rs', 'src\\lib.rs'])(
		'rejects unsafe source path %s',
		(value) => expect(() => sourcePath(value)).toThrow('Invalid documentation source path')
	);

	it('keeps URL-reserved characters in source filenames for route-segment encoding', () => {
		expect(sourcePath('src/odd#name?.rs')).toBe('src/odd#name?.rs');
		expect(sourcePath('src/malformed%2 name.rs')).toBe('src/malformed%2 name.rs');
	});
});
