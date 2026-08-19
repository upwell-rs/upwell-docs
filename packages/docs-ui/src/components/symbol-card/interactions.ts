import type { Attachment } from 'svelte/attachments';

import type { SymbolCardData } from './data.ts';

export interface ActiveSymbolCard<T = SymbolCardData> {
	readonly data: T;
	readonly anchor: HTMLElement;
}

export interface SymbolCardInteractionOptions<T = SymbolCardData> {
	readonly panelId: string;
	readonly selector: string;
	readonly read: (target: HTMLElement) => T | undefined;
	readonly onChange: (active: ActiveSymbolCard<T> | undefined) => void;
	readonly closeDelay?: number;
}

export interface SymbolCardInteractions<T = SymbolCardData> {
	readonly targets: Attachment<HTMLElement>;
	readonly card: Attachment<HTMLElement>;
	readonly active: ActiveSymbolCard<T> | undefined;
	open(anchor: HTMLElement): void;
	scheduleDismiss(): void;
	cancelDismiss(): void;
	dismiss(restoreFocus?: boolean): void;
	destroy(): void;
}

const DEFAULT_CLOSE_DELAY = 160;

export function createSymbolCardInteractions<T = SymbolCardData>(
	options: SymbolCardInteractionOptions<T>
): SymbolCardInteractions<T> {
	let active: ActiveSymbolCard<T> | undefined;
	let closing: ReturnType<typeof setTimeout> | undefined;
	let panel: HTMLElement | undefined;

	function configureTrigger(anchor: HTMLElement): void {
		anchor.setAttribute('aria-controls', options.panelId);
		anchor.setAttribute('aria-expanded', 'true');
		anchor.setAttribute('aria-haspopup', 'dialog');
	}

	function resetTrigger(anchor: HTMLElement): void {
		anchor.removeAttribute('aria-controls');
		anchor.removeAttribute('aria-expanded');
	}

	function initializeTrigger(target: HTMLElement): void {
		if (active?.anchor === target) {
			return;
		}

		target.setAttribute('aria-haspopup', 'dialog');
		target.setAttribute('aria-expanded', 'false');
		target.removeAttribute('aria-controls');
	}

	function initializeAddedTargets(node: Node): void {
		if (!(node instanceof HTMLElement)) {
			return;
		}

		if (node.matches(options.selector)) {
			initializeTrigger(node);
		}

		node.querySelectorAll<HTMLElement>(options.selector).forEach(initializeTrigger);
	}

	function cancelDismiss(): void {
		clearTimeout(closing);
		closing = undefined;
	}

	function setActive(next: ActiveSymbolCard<T> | undefined): void {
		const previous = active;

		active = next;

		if (previous && previous.anchor !== next?.anchor) {
			resetTrigger(previous.anchor);
		}

		if (next) {
			configureTrigger(next.anchor);
		}

		options.onChange(next);
	}

	function open(anchor: HTMLElement): void {
		const data = options.read(anchor);

		if (!data) {
			return;
		}

		cancelDismiss();
		setActive({ data, anchor });
	}

	function scheduleDismiss(): void {
		cancelDismiss();

		closing = setTimeout(() => {
			closing = undefined;
			setActive(undefined);
		}, options.closeDelay ?? DEFAULT_CLOSE_DELAY);
	}

	function dismiss(restoreFocus = false): void {
		const anchor = active?.anchor;

		cancelDismiss();
		setActive(undefined);

		if (restoreFocus) {
			anchor?.focus();
		}
	}

	function targetFrom(event: Event): HTMLElement | undefined {
		return event.target instanceof Element
			? event.target.closest<HTMLElement>(options.selector) ?? undefined
			: undefined;
	}

	function openFromEvent(event: Event): void {
		const target = targetFrom(event);

		if (target) {
			open(target);
		}
	}

	function leaveFromEvent(event: Event): void {
		if (targetFrom(event)) {
			scheduleDismiss();
		}
	}

	function enterCardFromTrigger(event: KeyboardEvent): void {
		const target = targetFrom(event);

		if (event.key !== 'Tab' || event.shiftKey || !target || active?.anchor !== target || !panel) {
			return;
		}

		const firstInteractive = panel.querySelector<HTMLElement>('a[href], button:not([disabled])');

		if (!firstInteractive) {
			return;
		}

		event.preventDefault();
		cancelDismiss();
		firstInteractive.focus();
	}

	const targets: Attachment<HTMLElement> = (node) => {
		node.querySelectorAll<HTMLElement>(options.selector).forEach(initializeTrigger);

		const observer = new MutationObserver((records) => {
			for (const record of records) {
				record.addedNodes.forEach(initializeAddedTargets);
			}
		});

		observer.observe(node, { childList: true, subtree: true });
		node.addEventListener('mouseover', openFromEvent);
		node.addEventListener('mouseout', leaveFromEvent);
		node.addEventListener('focusin', openFromEvent);
		node.addEventListener('focusout', leaveFromEvent);
		node.addEventListener('keydown', enterCardFromTrigger);

		return () => {
			node.removeEventListener('mouseover', openFromEvent);
			node.removeEventListener('mouseout', leaveFromEvent);
			node.removeEventListener('focusin', openFromEvent);
			node.removeEventListener('focusout', leaveFromEvent);
			node.removeEventListener('keydown', enterCardFromTrigger);
			observer.disconnect();
			cancelDismiss();
		};
	};

	const card: Attachment<HTMLElement> = (node) => {
		const dismissFromCard = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') {
				event.stopPropagation();
				dismiss(true);
			}
		};

		panel = node;
		node.addEventListener('mouseenter', cancelDismiss);
		node.addEventListener('mouseleave', scheduleDismiss);
		node.addEventListener('focusin', cancelDismiss);
		node.addEventListener('focusout', scheduleDismiss);
		node.addEventListener('keydown', dismissFromCard);

		return () => {
			node.removeEventListener('mouseenter', cancelDismiss);
			node.removeEventListener('mouseleave', scheduleDismiss);
			node.removeEventListener('focusin', cancelDismiss);
			node.removeEventListener('focusout', scheduleDismiss);
			node.removeEventListener('keydown', dismissFromCard);
			if (panel === node) {
				panel = undefined;
			}
		};
	};

	return {
		targets,
		card,
		get active() {
			return active;
		},
		open,
		scheduleDismiss,
		cancelDismiss,
		dismiss,
		destroy: cancelDismiss
	};
}
