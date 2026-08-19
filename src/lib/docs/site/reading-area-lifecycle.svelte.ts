import type { Attachment } from 'svelte/attachments';

import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@upwell/docs-kit/client';

const MINIMUM_READING_WIDTH = 544;

interface SidebarWidthMeasurements {
	readonly layout: number;
	readonly tableOfContents: number;
	readonly resizer: number;
}

interface ObservedResize {
	observe(target: Element): void;
	disconnect(): void;
}

export type ResizeObserverFactory = (callback: ResizeObserverCallback) => ObservedResize;

export function calculateSidebarMaximumWidth(measurements: SidebarWidthMeasurements): number {
	const available = measurements.layout
		- measurements.tableOfContents
		- measurements.resizer
		- MINIMUM_READING_WIDTH;

	return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, available));
}

/** Keeps the sidebar within the space left after the reading pane and optional table of contents. */
export function observeSidebarMaximumWidth(
	setMaximum: (width: number) => void,
	createObserver: ResizeObserverFactory = (callback) => new ResizeObserver(callback)
): Attachment<HTMLElement> {
	return (layout) => {
		const update = () => {
			const tableOfContents = layout.querySelector<HTMLElement>('.layout__toc');
			const resizer = layout.querySelector<HTMLElement>('.layout__resizer');

			setMaximum(calculateSidebarMaximumWidth({
				layout: layout.clientWidth,
				tableOfContents: tableOfContents?.offsetWidth ?? 0,
				resizer: resizer?.offsetWidth ?? 0
			}));
		};
		const observer = createObserver(update);

		observer.observe(layout);
		update();

		return () => observer.disconnect();
	};
}

function currentFragment(): string {
	return typeof location === 'undefined' ? '' : location.hash;
}

/** Returns the independently scrolling reading pane to the top after non-fragment navigation. */
export function resetReadingPaneOnNavigation(
	pathname: () => string,
	fragment: () => string = currentFragment
): Attachment<HTMLElement> {
	return (pane) => {
		void pathname();

		if (fragment()) {
			return;
		}

		pane.scrollTo({ top: 0 });
	};
}
