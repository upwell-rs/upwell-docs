import { describe, expect, it } from 'vitest';

import { clampSelection, moveSelection, type SearchNavigationKey } from './navigation.ts';

describe('search selection navigation', () => {
	it.each([
		{ index: -2, count: 3, expected: 0 },
		{ index: 0, count: 3, expected: 0 },
		{ index: 1, count: 3, expected: 1 },
		{ index: 4, count: 3, expected: 2 },
		{ index: 4, count: 0, expected: 0 }
	])('clamps index $index for $count results', ({ index, count, expected }) => {
		expect(clampSelection(index, count)).toBe(expected);
	});

	it.each<{ key: SearchNavigationKey; index: number; count: number; expected: number }>([
		{ key: 'ArrowDown', index: 0, count: 3, expected: 1 },
		{ key: 'ArrowDown', index: 2, count: 3, expected: 0 },
		{ key: 'ArrowDown', index: 8, count: 3, expected: 0 },
		{ key: 'ArrowUp', index: 2, count: 3, expected: 1 },
		{ key: 'ArrowUp', index: 0, count: 3, expected: 2 },
		{ key: 'ArrowUp', index: -3, count: 3, expected: 2 },
		{ key: 'Home', index: 2, count: 3, expected: 0 },
		{ key: 'End', index: 0, count: 3, expected: 2 },
		{ key: 'ArrowDown', index: 2, count: 0, expected: 0 },
		{ key: 'ArrowUp', index: 2, count: 0, expected: 0 },
		{ key: 'Home', index: 2, count: 0, expected: 0 },
		{ key: 'End', index: 2, count: 0, expected: 0 }
	])('$key moves index $index to $expected with $count results', ({ key, index, count, expected }) => {
		expect(moveSelection(key, index, count)).toBe(expected);
	});

});
