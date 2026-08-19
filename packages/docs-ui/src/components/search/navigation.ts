export type SearchNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export function clampSelection(index: number, count: number): number {
	if (count <= 0) {
		return 0;
	}

	return Math.min(Math.max(index, 0), count - 1);
}

export function moveSelection(key: SearchNavigationKey, index: number, count: number): number {
	if (count <= 0) {
		return 0;
	}

	const selected = clampSelection(index, count);

	switch (key) {
		case 'ArrowDown':
			return (selected + 1) % count;
		case 'ArrowUp':
			return (selected - 1 + count) % count;
		case 'Home':
			return 0;
		case 'End':
			return count - 1;
	}
}
