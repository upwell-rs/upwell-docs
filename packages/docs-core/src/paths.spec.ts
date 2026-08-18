import { describe, expect, it } from 'vitest';

import { directoryOf, resolveRelativePath, splitLocation } from './paths.ts';

describe('resolveRelativePath', () => {
	it.each([
		['di', 'advanced', 'di/advanced'],
		['di', './advanced', 'di/advanced'],
		['di', '../framework/app-macro', 'framework/app-macro'],
		['crates/app/src', '../../../Cargo.toml', 'Cargo.toml'],
		['di', '/getting-started', 'getting-started'],
		['', 'getting-started', 'getting-started']
	])('resolves %s + %s', (directory, reference, expected) => {
		expect(resolveRelativePath(directory, reference)).toBe(expected);
	});

	it.each([
		['di', '../../..'],
		['di', 'https://example.com/page'],
		['di', 'mailto:someone@example.com'],
		['di', '//example.com/page'],
		['di', '']
	])('refuses %s + %s, which names nothing in the tree', (directory, reference) => {
		expect(resolveRelativePath(directory, reference)).toBeNull();
	});
});

describe('directoryOf', () => {
	it.each([
		['di/components', 'di'],
		['extensions/protocols/authoring', 'extensions/protocols'],
		['getting-started', '']
	])('takes the directory of %s', (path, expected) => {
		expect(directoryOf(path)).toBe(expected);
	});
});

describe('splitLocation', () => {
	it.each([
		['guide.md', 'guide.md', ''],
		['guide.md#usage', 'guide.md', '#usage'],
		['guide.md?plain=1', 'guide.md', '?plain=1'],
		['guide.md?plain=1#L4', 'guide.md', '?plain=1#L4'],
		['#usage', '', '#usage']
	])('splits %s', (reference, path, suffix) => {
		expect(splitLocation(reference)).toEqual({ path, suffix });
	});
});
