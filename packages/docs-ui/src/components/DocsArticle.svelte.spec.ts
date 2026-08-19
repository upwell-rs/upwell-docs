import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

import DocsArticle from './DocsArticle.svelte';

function article(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

describe('DocsArticle symbol interactions', () => {
	it('opens local cards and keeps article-owned jump behavior', async () => {
		const scrollIntoView = vi.fn();
		const screen = render(DocsArticle, {
			children: article(`<div>
				<span id="Lexample-7">definition</span>
				<button data-local="Greeter" data-local-kind="struct" data-local-line="7" data-local-block="example">Greeter</button>
			</div>`)
		});
		const token = screen.container.querySelector<HTMLElement>('[data-local]')!;
		const definition = screen.container.querySelector<HTMLElement>('#Lexample-7')!;

		definition.scrollIntoView = scrollIntoView;
		token.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

		await expect.element(screen.getByRole('dialog', { name: 'Symbol details' })).toBeInTheDocument();
		await expect.element(screen.getByText('Defined on line 7 of this example — click to jump there')).toBeInTheDocument();

		token.click();

		expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'center', behavior: 'smooth' });
		expect(definition.dataset.jumped).toBe('true');
	});

	it('moves Tab from a focused documented trigger into the card', async () => {
		const screen = render(DocsArticle, {
			children: article('<a href="/symbols/App" data-symbol="upwell::App" data-symbol-kind="struct">App</a>')
		});
		const token = screen.container.querySelector<HTMLAnchorElement>('[data-symbol]')!;

		token.focus();
		await expect.element(screen.getByRole('dialog', { name: 'Symbol details' })).toBeInTheDocument();
		expect(token.getAttribute('aria-expanded')).toBe('true');
		expect(token.getAttribute('aria-controls')).toMatch(/^symbol-card-/);

		token.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

		const documentation = screen.getByRole('link', { name: 'Documentation' });

		await expect.poll(() => document.activeElement).toBe(documentation.element());
	});

	it('initializes replacement article tokens without remounting the interaction attachment', async () => {
		const screen = render(DocsArticle, {
			children: article('<p>Initial article.</p>')
		});
		const host = screen.container.querySelector<HTMLElement>('article')!;

		host.innerHTML = '<a href="/symbols/App" data-symbol="upwell::App">App</a><span data-local="Local">Local</span>';

		const documented = host.querySelector<HTMLElement>('[data-symbol]')!;
		const local = host.querySelector<HTMLElement>('[data-local]')!;

		await expect.poll(() => documented.getAttribute('aria-expanded')).toBe('false');
		expect(documented.getAttribute('aria-haspopup')).toBe('dialog');
		expect(documented.hasAttribute('aria-controls')).toBe(false);
		expect(local.getAttribute('aria-expanded')).toBe('false');
		expect(local.getAttribute('aria-haspopup')).toBe('dialog');
		expect(local.hasAttribute('aria-controls')).toBe(false);
	});
});
