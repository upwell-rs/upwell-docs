import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

import Search from './Search.svelte';
import { SearchIndex } from '../search/index.svelte.ts';
import type { SearchRecord } from '../search/rank.ts';

const version = { id: 'current', label: 'Current' } as const;
const records = [
	{ href: '/guides/routing', title: 'Routing guide', kind: 'guide' as const },
	{ href: '/guides/state', title: 'State guide', kind: 'guide' as const }
];

function response(items: readonly SearchRecord[] = records): Response {
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
	vi.restoreAllMocks();
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

	it('imperatively focuses and selects the existing query when opened', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
		const screen = render(Search, {
			version,
			searchIndex: new SearchIndex(),
			searchHref: () => '/search.json',
			navigate: vi.fn()
		});
		const input = screen.container.querySelector<HTMLInputElement>('[role="combobox"]')!;

		await type(input, 'guide');
		input.blur();
		screen.component.open();

		await expect.poll(() => input.ownerDocument.activeElement).toBe(input);
		expect(input.selectionStart).toBe(0);
		expect(input.selectionEnd).toBe('guide'.length);
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

	it('moves the active descendant with arrow, Home, and End keys while retaining input focus', async () => {
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

		await press(input, 'Home');
		expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);

		await press(input, 'ArrowUp');
		expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);

		await press(input, 'End');
		expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);

		await type(input, 'routing');
		await expect.poll(() => screen.container.querySelectorAll('[role="option"]')).toHaveLength(1);
		expect(input.getAttribute('aria-activedescendant')).toBe(
			screen.container.querySelector<HTMLElement>('[role="option"]')!.id
		);
	});

	it('keeps the active option visible while keyboard selection moves', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
		const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
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
		scrollIntoView.mockClear();

		await press(input, 'ArrowDown');
		await expect.poll(() => scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

		const active = screen.container.querySelector<HTMLElement>('[aria-selected="true"]')!;

		expect(scrollIntoView.mock.instances.at(-1)).toBe(active);
	});

	it('closes from the backdrop, restores focus, and resets the query', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
		const opener = document.createElement('button');

		document.body.append(opener);
		opener.focus();

		const screen = render(Search, {
			version,
			searchIndex: new SearchIndex(),
			searchHref: () => '/search.json',
			navigate: vi.fn()
		});
		const dialog = screen.container.querySelector('dialog')!;
		const input = screen.container.querySelector<HTMLInputElement>('[role="combobox"]')!;

		screen.component.open();
		await type(input, 'guide');
		await expect.poll(() => input.getAttribute('aria-expanded')).toBe('true');

		screen.container.querySelector<HTMLElement>('.search__backdrop')!.click();
		await expect.poll(() => dialog.open).toBe(false);
		await expect.poll(() => input.value).toBe('');

		expect(document.activeElement).toBe(opener);
		expect(input.getAttribute('aria-expanded')).toBe('false');

		opener.remove();
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

	it('renders result metadata and highlights the matched fields', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				response([
					{
						href: '/symbols/router',
						title: 'Router',
						kind: 'symbol' as const,
						symbolKind: 'struct_field',
						detail: 'crate::Router',
						signature: 'pub struct Router',
						text: 'A router dispatches requests.'
					}
				])
			)
		);
		const screen = render(Search, {
			version,
			searchIndex: new SearchIndex(),
			searchHref: () => '/search.json',
			navigate: vi.fn()
		});
		const input = screen.container.querySelector<HTMLInputElement>('[role="combobox"]')!;

		screen.component.open();
		await type(input, 'router');
		await expect.poll(() => input.getAttribute('aria-expanded')).toBe('true');

		const option = screen.container.querySelector<HTMLAnchorElement>('.search__result')!;

		expect(option.querySelector('.search__kind')?.textContent).toContain('Symbol');
		expect(option.querySelector('.search__symbol-kind')?.textContent).toBe('struct field');
		expect(option.querySelector('.search__detail')?.textContent).toBe('crate::Router');
		expect(option.querySelector('.search__signature')?.textContent).toBe('pub struct Router');
		expect(option.querySelector('.search__excerpt')?.textContent).toContain('router dispatches requests');
		expect(option.querySelectorAll('mark').length).toBeGreaterThan(0);
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
