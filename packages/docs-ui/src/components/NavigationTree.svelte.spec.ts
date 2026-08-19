import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';

import NavigationTree from './NavigationTree.svelte';

const { revealWithin } = vi.hoisted(() => ({ revealWithin: vi.fn() }));

vi.mock('../reveal.ts', () => ({ revealWithin }));

const nodes = [
	{
		type: 'group' as const,
		id: 'guides:components',
		label: 'Components',
		href: '/components',
		pageId: 'components',
		kind: 'guide' as const,
		defaultOpen: false,
		children: [
			{
				type: 'group' as const,
				id: 'guides:components/forms',
				label: 'Forms',
				kind: 'guide' as const,
				defaultOpen: false,
				children: [{ type: 'page' as const, id: 'forms/input', title: 'Input', href: '/forms/input', reference: false }]
			}
		]
	},
	{ type: 'page' as const, id: 'symbols/VeryLongIdentifier', title: 'VeryLongIdentifier', href: '/symbols/VeryLongIdentifier', reference: true }
];

describe('NavigationTree', () => {
	it('lazily renders nested groups and reports each toggle', async () => {
		const onToggle = vi.fn();
		const screen = render(NavigationTree, {
			nodes,
			current: '',
			activeGroups: new Set(),
			isOpen: (_id, fallback) => fallback,
			onToggle
		});
		const components = screen.container.querySelector<HTMLDetailsElement>('[data-group-id="guides:components"]')!;

		expect(screen.container.querySelector('[data-group-id="guides:components/forms"]')).toBeNull();

		components.open = true;
		components.dispatchEvent(new Event('toggle'));

		expect(onToggle).toHaveBeenCalledWith('guides:components', true);
	});

	it('marks active group entrypoints and pages as current', async () => {
		const screen = render(NavigationTree, {
			nodes,
			current: 'components',
			activeGroups: new Set(['guides:components']),
			isOpen: (_id, fallback) => fallback,
			onToggle: vi.fn()
		});

		const entry = screen.getByRole('link', { name: 'Components' });

		await expect.element(entry).toHaveAttribute('aria-current', 'page');
		expect(entry.element().closest('summary')).toHaveClass('tree__summary--current');
	});

	it('preserves reference truncation and reveals only from the root tree', async () => {
		revealWithin.mockClear();
		const screen = render(NavigationTree, {
			nodes,
			current: 'forms/input',
			activeGroups: new Set(['guides:components', 'guides:components/forms']),
			truncate: true,
			isOpen: (_id, fallback) => fallback,
			onToggle: vi.fn()
		});
		const current = screen.getByRole('link', { name: 'Input' });
		const reference = screen.getByRole('link', { name: 'VeryLongIdentifier' });

		await expect.element(current).toHaveAttribute('aria-current', 'page');
		expect(reference).toHaveAttribute('title', 'VeryLongIdentifier');
		expect(screen.container.querySelector('ul.tree')?.dataset.depth).toBe('0');
		expect(revealWithin).toHaveBeenCalledTimes(1);
		expect(revealWithin).toHaveBeenCalledWith(current.element(), screen.container.querySelector('ul.tree'));
	});
});
