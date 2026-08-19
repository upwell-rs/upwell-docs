import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

import SourceCode from './SourceCode.svelte';

describe('SourceCode symbol interactions', () => {
	it('shares documented metadata parsing while retaining modifier inspection', async () => {
		const inspect = vi.fn();
		const screen = render(SourceCode, {
			html: '<a href="/src/app.rs#L12" data-symbol="upwell::App" data-symbol-kind="struct" data-symbol-source="/src/app.rs#L12" data-symbol-docs="/symbols/App" data-symbol-docs-title="App documentation">App</a>',
			oninspect: inspect
		});
		const token = screen.container.querySelector<HTMLAnchorElement>('[data-symbol]')!;

		token.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

		await expect.element(screen.getByRole('dialog', { name: 'Symbol details' })).toBeInTheDocument();
		await expect.element(screen.getByRole('link', { name: 'App documentation' })).toHaveAttribute('href', '/symbols/App');
		await expect.element(screen.getByRole('link', { name: 'View source' })).toHaveAttribute('href', '/src/app.rs#L12');

		token.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));

		expect(inspect).toHaveBeenCalledExactlyOnceWith('upwell::App');
	});

	it('does not expose a source-line href as documentation without data-symbol-docs', async () => {
		const screen = render(SourceCode, {
			html: '<a href="/src/app.rs#L12" data-symbol="upwell::App" data-symbol-kind="struct" data-symbol-source="/src/app.rs#L12">App</a>',
			oninspect: vi.fn()
		});
		const token = screen.container.querySelector<HTMLAnchorElement>('[data-symbol]')!;

		token.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

		await expect.element(screen.getByRole('dialog', { name: 'Symbol details' })).toBeInTheDocument();
		await expect.element(screen.getByRole('link', { name: 'View source' })).toHaveAttribute('href', '/src/app.rs#L12');
		await expect.element(screen.getByRole('link', { name: 'Documentation' })).not.toBeInTheDocument();
	});

	it('keeps candidate JSON parsing and the ambiguous panel local to the source viewer', async () => {
		const candidates = [{
			symbol: 'upwell::App',
			name: 'App',
			kind: 'struct',
			href: '/src/app.rs#L12',
			signature: 'pub struct App',
			doc: 'Application runtime.'
		}];
		const screen = render(SourceCode, {
			html: `<a href="#" data-candidates='${JSON.stringify(candidates)}'>App</a>`,
			oninspect: vi.fn()
		});
		const token = screen.container.querySelector<HTMLAnchorElement>('[data-candidates]')!;

		token.click();

		await expect.element(screen.getByRole('complementary', { name: 'Possible symbols' })).toBeInTheDocument();
		await expect.element(screen.getByRole('link', { name: /upwell::App/ })).toHaveAttribute('href', '/src/app.rs#L12');
	});

	it('initializes replacement source tokens without remounting the interaction attachment', async () => {
		const screen = render(SourceCode, {
			html: '<span>Initial source.</span>',
			oninspect: vi.fn()
		});
		const host = screen.container.querySelector<HTMLElement>('.code')!;

		host.innerHTML = '<a href="/src/app.rs#L12" data-symbol="upwell::App">App</a><a href="https://doc.rust-lang.org" data-external="std::sync::Arc">Arc</a>';

		const documented = host.querySelector<HTMLElement>('[data-symbol]')!;
		const external = host.querySelector<HTMLElement>('[data-external]')!;

		await expect.poll(() => documented.getAttribute('aria-expanded')).toBe('false');
		expect(documented.getAttribute('aria-haspopup')).toBe('dialog');
		expect(documented.hasAttribute('aria-controls')).toBe(false);
		expect(external.getAttribute('aria-expanded')).toBe('false');
		expect(external.getAttribute('aria-haspopup')).toBe('dialog');
		expect(external.hasAttribute('aria-controls')).toBe(false);
	});
});
