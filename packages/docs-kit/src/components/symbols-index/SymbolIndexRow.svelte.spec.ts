import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';

import SymbolIndexRow from './SymbolIndexRow.svelte';

describe('SymbolIndexRow', () => {
	it('presents the symbol path, kind, curated status, and summary', async () => {
		const screen = render(SymbolIndexRow, {
			record: {
				path: 'framework::App',
				name: 'App',
				crate: 'framework',
				kind: 'struct',
				summary: 'Application runtime.',
				href: '/symbols/App',
				authored: true
			}
		});

		await expect.element(screen.getByRole('link', { name: 'framework::App' })).toHaveAttribute('href', '/symbols/App');
		await expect.element(screen.getByText('struct')).toHaveClass('kind');
		await expect.element(screen.getByText('curated')).toHaveClass('authored');
		await expect.element(screen.getByText('Application runtime.')).toBeInTheDocument();
	});

	it('omits an absent summary and curated status', async () => {
		const screen = render(SymbolIndexRow, {
			record: {
				path: 'framework_extra::Client',
				name: 'Client',
				crate: 'framework-extra',
				kind: 'struct',
				summary: null,
				href: '/symbols/Client',
				authored: false
			}
		});

		await expect.element(screen.getByRole('link', { name: 'framework_extra::Client' })).toBeInTheDocument();
		await expect.element(screen.getByText('curated')).not.toBeInTheDocument();
		expect(screen.container.querySelector('p')).toBeNull();
	});
});
