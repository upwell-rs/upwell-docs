import { describe, expect, it } from 'vitest';

import { parseVersion } from '../version/semver.ts';
import { groupBySlug, overlaysIn, resolveVariant, splitOverlay, type Variant } from './overlay.ts';

function v(value: string) {
	return parseVersion(value, 'test');
}

/** Shorthand for a variant carrying a label, so assertions read as "which file won". */
function variant(overlay: string | null, value: string): Variant<string> {
	return { overlay: overlay === null ? null : v(overlay), value };
}

describe('splitOverlay', () => {
	it('reads a trunk path as having no overlay', () => {
		expect(splitOverlay('concepts/di')).toEqual({ overlay: null, slug: 'concepts/di' });
	});

	it('reads an overlay directory as a version', () => {
		expect(splitOverlay('@0.21.0/concepts/di')).toEqual({ overlay: '0.21.0', slug: 'concepts/di' });
	});

	it('leaves a lone @ segment alone, since it contributes no slug', () => {
		expect(splitOverlay('@0.21.0')).toEqual({ overlay: null, slug: '@0.21.0' });
	});

	it('only treats the first segment as an overlay', () => {
		expect(splitOverlay('concepts/@0.21.0/di')).toEqual({ overlay: null, slug: 'concepts/@0.21.0/di' });
	});
});

describe('resolveVariant', () => {
	it('uses the trunk when there is no overlay', () => {
		expect(resolveVariant([variant(null, 'trunk')], v('0.20.0'))).toBe('trunk');
	});

	it('prefers an overlay at the version over the trunk', () => {
		expect(resolveVariant([variant(null, 'trunk'), variant('0.21.0', 'v21')], v('0.21.0'))).toBe('v21');
	});

	it('carries an overlay forward to later versions', () => {
		// The point of overlays: writing one at 0.21 must not oblige anyone to copy it into 0.22.
		expect(resolveVariant([variant(null, 'trunk'), variant('0.21.0', 'v21')], v('0.30.0'))).toBe('v21');
	});

	it('ignores an overlay from a later version', () => {
		expect(resolveVariant([variant(null, 'trunk'), variant('0.21.0', 'v21')], v('0.20.0'))).toBe('trunk');
	});

	it('picks the highest applicable overlay', () => {
		const variants = [variant(null, 'trunk'), variant('0.21.0', 'v21'), variant('0.25.0', 'v25')];

		expect(resolveVariant(variants, v('0.21.0'))).toBe('v21');
		expect(resolveVariant(variants, v('0.25.0'))).toBe('v25');
	});

	it('resolves nothing when a page exists only in a later overlay', () => {
		// This is how a page introduced at 0.21 stays absent from 0.20 without declaring anything.
		expect(resolveVariant([variant('0.21.0', 'v21')], v('0.20.0'))).toBeUndefined();
	});

	it('compares overlays numerically, not lexically', () => {
		// '0.9.0' sorts after '0.20.0' as a string, which would pick the wrong overlay.
		const variants = [variant('0.9.0', 'v9'), variant('0.20.0', 'v20')];

		expect(resolveVariant(variants, v('0.30.0'))).toBe('v20');
	});
});

describe('groupBySlug', () => {
	it('collects the trunk and its overlays under one slug', () => {
		const grouped = groupBySlug(
			[
				{ relativePath: 'concepts/di', value: 'trunk' },
				{ relativePath: '@0.21.0/concepts/di', value: 'v21' }
			],
			'Content'
		);

		expect(grouped.get('concepts/di')).toMatchObject([
			{ overlay: null, value: 'trunk' },
			{ overlay: { major: 0, minor: 21, patch: 0 }, value: 'v21' }
		]);
	});

	it('keeps unrelated slugs apart', () => {
		const grouped = groupBySlug(
			[
				{ relativePath: 'a', value: 'a' },
				{ relativePath: '@0.21.0/b', value: 'b' }
			],
			'Content'
		);

		expect([...grouped.keys()].sort()).toEqual(['a', 'b']);
	});

	it('rejects an overlay directory that is not a version', () => {
		// Reported once, when content loads, rather than quietly failing to match on every lookup.
		expect(() => groupBySlug([{ relativePath: '@next/a', value: 'a' }], 'Content')).toThrowError(
			/is not a version/
		);
	});

	it('accepts an overlay for a version that has not been released yet', () => {
		expect(() => groupBySlug([{ relativePath: '@99.0.0/a', value: 'a' }], 'Content')).not.toThrow();
	});
});

describe('overlaysIn', () => {
	it('lists every version named by an overlay directory, oldest first', () => {
		expect(overlaysIn(['a', '@0.21.0/a', '@0.9.0/b', '@0.21.0/c'])).toEqual(['0.9.0', '0.21.0']);
	});

	it('returns nothing when there are no overlays', () => {
		expect(overlaysIn(['a', 'b/c'])).toEqual([]);
	});
});
