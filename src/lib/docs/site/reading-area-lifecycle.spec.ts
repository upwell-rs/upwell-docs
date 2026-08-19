import { describe, expect, it, vi } from 'vitest';

import {
	calculateSidebarMaximumWidth,
	observeSidebarMaximumWidth,
	resetReadingPaneOnNavigation,
	type ResizeObserverFactory
} from './reading-area-lifecycle.svelte.ts';

describe('sidebar maximum width lifecycle', () => {
	it('clamps measured space to the configured sidebar bounds', () => {
		expect(calculateSidebarMaximumWidth({ layout: 700, tableOfContents: 224, resizer: 8 })).toBe(190);
		expect(calculateSidebarMaximumWidth({ layout: 1200, tableOfContents: 224, resizer: 8 })).toBe(424);
		expect(calculateSidebarMaximumWidth({ layout: 1800, tableOfContents: 224, resizer: 8 })).toBe(560);
	});

	it('observes its layout, recalculates on resize, and disconnects on cleanup', () => {
		const setMaximum = vi.fn();
		const observe = vi.fn();
		const disconnect = vi.fn();
		let resize: ResizeObserverCallback | undefined;
		const createObserver: ResizeObserverFactory = (callback) => {
			resize = callback;

			return { observe, disconnect };
		};
		const tableOfContents = { offsetWidth: 224 };
		const resizer = { offsetWidth: 8 };
		const layout = {
			clientWidth: 1200,
			querySelector: (selector: string) => selector === '.layout__toc' ? tableOfContents : resizer
		} as unknown as HTMLElement;
		const cleanup = observeSidebarMaximumWidth(setMaximum, createObserver)(layout);

		expect(observe).toHaveBeenCalledWith(layout);
		expect(setMaximum).toHaveBeenLastCalledWith(424);

		Object.assign(layout, { clientWidth: 1000 });
		resize?.([], {} as ResizeObserver);

		expect(setMaximum).toHaveBeenLastCalledWith(224);

		if (typeof cleanup === 'function') {
			cleanup();
		}

		expect(disconnect).toHaveBeenCalledOnce();
	});
});

describe('reading pane scroll lifecycle', () => {
	it('reads the pathname and resets non-fragment navigation', () => {
		const pathname = vi.fn(() => '/docs/v1/guide');
		const scrollTo = vi.fn();
		const pane = { scrollTo } as unknown as HTMLElement;

		resetReadingPaneOnNavigation(pathname, () => '')(pane);

		expect(pathname).toHaveBeenCalledOnce();
		expect(scrollTo).toHaveBeenLastCalledWith({ top: 0 });
	});

	it('reads the pathname but leaves fragment navigation to the browser', () => {
		const pathname = vi.fn(() => '/docs/v1/guide');
		const scrollTo = vi.fn();
		const pane = { scrollTo } as unknown as HTMLElement;

		resetReadingPaneOnNavigation(pathname, () => '#details')(pane);

		expect(pathname).toHaveBeenCalledOnce();
		expect(scrollTo).not.toHaveBeenCalled();
	});
});
