import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';

import SymbolIndexFilters from './SymbolIndexFilters.svelte';

describe('SymbolIndexFilters', () => {
	it('exposes labelled query and crate controls with every crate option', async () => {
		const screen = render(SymbolIndexFilters, {
			crates: ['framework', 'framework-extra'],
			query: 'App',
			crate: 'framework'
		});

		await expect.element(screen.getByRole('searchbox', { name: 'Find a symbol' })).toHaveValue('App');
		await expect.element(screen.getByRole('combobox', { name: 'Crate' })).toHaveValue('framework');
		await expect.element(screen.getByRole('option', { name: 'All crates' })).toBeInTheDocument();
		await expect.element(screen.getByRole('option', { name: 'framework-extra' })).toBeInTheDocument();
	});
});
