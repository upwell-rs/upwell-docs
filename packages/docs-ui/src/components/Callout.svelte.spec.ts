import { render } from 'vitest-browser-svelte';
import { describe, expect, it } from 'vitest';

import Callout from './Callout.svelte';
import { createRawSnippet } from 'svelte';

/** Minimal children snippet, since every content component takes one. */
function body(text: string) {
	return createRawSnippet(() => ({ render: () => `<p>${text}</p>` }));
}

describe('Callout', () => {
	it('labels an info callout by default', async () => {
		const screen = render(Callout, { children: body('Composable routers.') });

		await expect.element(screen.getByText('Note')).toBeInTheDocument();
		await expect.element(screen.getByText('Composable routers.')).toBeInTheDocument();
	});

	it('uses the heading that matches the kind', async () => {
		const screen = render(Callout, { type: 'warning', children: body('Careful here.') });

		await expect.element(screen.getByText('Warning')).toBeInTheDocument();
	});

	it('lets a page override the heading', async () => {
		const screen = render(Callout, { type: 'danger', title: 'Data loss', children: body('Irreversible.') });

		await expect.element(screen.getByText('Data loss')).toBeInTheDocument();
	});
});
