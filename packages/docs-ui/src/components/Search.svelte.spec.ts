import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

import Search from './Search.svelte';
import { SearchIndex } from '../search/index.svelte.ts';

const version = { id: 'current', label: 'Current' } as const;
const records = [
	{ href: '/guides/routing', title: 'Routing guide', kind: 'guide' as const },
	{ href: '/guides/state', title: 'State guide', kind: 'guide' as const }
];

function response(items = records): Response {
	return new Response(JSON.stringify({ version: version.id, records: items, degraded: false }));
}

function type(input: HTMLInputElement, value: string): Promise<void> {
	input.value = value;
	input.dispatchEvent(new InputEvent('input', { bubbles: true }));

	return tick();
}

function press(input: HTMLInputElement, key: string): Promise<void> {
	input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

	return tick();
}

afterEach(() => {
	vi.unstubAllGlobals();
	document.documentElement.style.removeProperty('--accent');
});

describe('Search', () => {
	it('connects the combobox to a stable listbox and its options', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
		const screen = render(Search, {
			version,
			searchIndex: new SearchIndex(),
			searchHref: () => '/search.json',
			navigate: vi.fn()
		});
		const input = screen.container.querySelector<HTMLInputElement>('[role="combobox"]')!;
		const resultsId = input.getAttribute('aria-controls')!;
		const listbox = screen.container.querySelector<HTMLElement>(`#${CSS.escape(resultsId)}`)!;

		expect(input.getAttribute('aria-label')).toBe('Search Current documentation');
		expect(input.getAttribute('aria-expanded')).toBe('false');
		expect(input.hasAttribute('aria-activedescendant')).toBe(false);
		expect(listbox.getAttribute('role')).toBe('listbox');
		expect(listbox.hidden).toBe(true);

		screen.component.open();
		await expect.poll(() => input.ownerDocument.activeElement).toBe(input);
		await expect.poll(() => input.getAttribute('aria-expanded')).toBe('false');
		await type(input, 'guide');
		await expect.poll(() => input.getAttribute('aria-expanded')).toBe('true');

		const options = listbox.querySelectorAll<HTMLAnchorElement>('[role="option"]');

		expect(listbox.hidden).toBe(false);
		expect(options).toHaveLength(2);
		expect(options[0].tagName).toBe('A');
		expect(options[0].getAttribute('href')).toBe('/guides/state');
		expect(options[0].getAttribute('role')).toBe('option');
		expect(options[0].getAttribute('aria-selected')).toBe('true');
		expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
		expect(options[0].hasAttribute('aria-current')).toBe(false);
	});

	it('keeps options out of the tab order', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
		const screen = render(Search, {
			version,
			searchIndex: new SearchIndex(),
			searchHref: () => '/search.json',
			navigate: vi.fn()
		});
		const input = screen.container.querySelector<HTMLInputElement>('[role="combobox"]')!;

		screen.component.open();
		await type(input, 'guide');
		await expect.poll(() => input.getAttribute('aria-expanded')).toBe('true');

		const options = screen.container.querySelectorAll<HTMLAnchorElement>('[role="option"]');
		const compositeTabStops = screen.container.querySelectorAll<HTMLElement>(
			'[role="combobox"]:not([tabindex="-1"]), [role="listbox"] a:not([tabindex="-1"])'
		);

		expect(options).toHaveLength(2);
		expect([...options].every((option) => option.tabIndex === -1)).toBe(true);
		expect([...compositeTabStops]).toEqual([input]);
	});

	it('moves the active descendant while retaining input focus', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
		const screen = render(Search, {
			version,
			searchIndex: new SearchIndex(),
			searchHref: () => '/search.json',
			navigate: vi.fn()
		});
		const input = screen.container.querySelector<HTMLInputElement>('[role="combobox"]')!;

		screen.component.open();
		await type(input, 'guide');
		await expect.poll(() => input.getAttribute('aria-expanded')).toBe('true');

		const options = screen.container.querySelectorAll<HTMLAnchorElement>('[role="option"]');

		await press(input, 'ArrowDown');

		expect(input.ownerDocument.activeElement).toBe(input);
		expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
		expect(options[0].getAttribute('aria-selected')).toBe('false');
		expect(options[1].getAttribute('aria-selected')).toBe('true');
	});

	it('opens the active descendant with Enter', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
		const navigate = vi.fn();
		const screen = render(Search, {
			version,
			searchIndex: new SearchIndex(),
			searchHref: () => '/search.json',
			navigate
		});
		const dialog = screen.container.querySelector('dialog')!;
		const input = screen.container.querySelector<HTMLInputElement>('[role="combobox"]')!;

		screen.component.open();
		await type(input, 'guide');
		await expect.poll(() => input.getAttribute('aria-expanded')).toBe('true');

		const options = screen.container.querySelectorAll<HTMLAnchorElement>('[role="option"]');

		await press(input, 'ArrowDown');
		expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);

		await press(input, 'Enter');

		expect(navigate).toHaveBeenCalledExactlyOnceWith('/guides/routing', false);
		expect(dialog.open).toBe(false);
	});

	it('retains native anchor activation for mouse and modifier clicks', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
		const navigate = vi.fn();
		const screen = render(Search, {
			version,
			searchIndex: new SearchIndex(),
			searchHref: () => '/search.json',
			navigate
		});
		const dialog = screen.container.querySelector('dialog')!;
		const input = screen.container.querySelector<HTMLInputElement>('[role="combobox"]')!;

		screen.component.open();
		await type(input, 'guide');
		await expect.poll(() => input.getAttribute('aria-expanded')).toBe('true');

		const option = screen.container.querySelector<HTMLAnchorElement>('[role="option"]')!;
		const click = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });

		option.addEventListener('click', (event) => event.preventDefault(), { once: true });
		option.dispatchEvent(click);
		await tick();

		expect(option.href).toBe(new URL('/guides/state', location.href).href);
		expect(click.metaKey).toBe(true);
		expect(click.defaultPrevented).toBe(true);
		expect(navigate).not.toHaveBeenCalled();
		expect(dialog.open).toBe(false);
	});

	it('announces loading, result counts, empty results, and failures politely', async () => {
		let resolveFetch!: (value: Response) => void;
		const pending = new Promise<Response>((resolve) => (resolveFetch = resolve));

		vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));
		const loaded = render(Search, {
			version,
			searchIndex: new SearchIndex(),
			searchHref: () => '/search.json',
			navigate: vi.fn()
		});
		const input = loaded.container.querySelector<HTMLInputElement>('[role="combobox"]')!;
		const status = loaded.container.querySelector<HTMLElement>('[role="status"]')!;

		loaded.component.open();
		await expect.poll(() => status.textContent).toBe('Loading search results.');

		resolveFetch(response());
		await type(input, 'guide');
		await expect.poll(() => status.textContent).toBe('2 search results.');

		await type(input, 'missing');
		await expect.poll(() => status.textContent).toBe('No search results.');
		expect(status.getAttribute('aria-live')).toBe('polite');
		expect(status.getAttribute('aria-atomic')).toBe('true');

		await loaded.unmount();
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
		const failed = render(Search, {
			version,
			searchIndex: new SearchIndex(),
			searchHref: () => '/search.json',
			navigate: vi.fn()
		});
		const failureStatus = failed.container.querySelector<HTMLElement>('[role="status"]')!;

		failed.component.open();
		await expect.poll(() => failureStatus.textContent).toBe('The search index could not be loaded.');
	});

	it('gives the focused input a visible token-based outline', async () => {
		document.documentElement.style.setProperty('--accent', 'rgb(11, 98, 214)');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
		const screen = render(Search, {
			version,
			searchIndex: new SearchIndex(),
			searchHref: () => '/search.json',
			navigate: vi.fn()
		});
		const input = screen.container.querySelector<HTMLInputElement>('[role="combobox"]')!;

		screen.component.open();
		await expect.poll(() => input.ownerDocument.activeElement).toBe(input);

		const style = getComputedStyle(input);

		expect(input.classList.contains('search__input')).toBe(true);
		expect(style.outlineStyle).toBe('solid');
		expect(style.outlineWidth).toBe('2px');
		expect(style.outlineColor).toBe('rgb(11, 98, 214)');
	});
});
