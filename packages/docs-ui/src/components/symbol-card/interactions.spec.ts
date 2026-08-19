import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSymbolCardInteractions } from './interactions.ts';

function createAnchor(): HTMLElement {
	const attributes = new Map<string, string>();

	return {
		setAttribute: vi.fn((name: string, value: string) => attributes.set(name, value)),
		removeAttribute: vi.fn((name: string) => attributes.delete(name)),
		getAttribute: vi.fn((name: string) => attributes.get(name) ?? null),
		focus: vi.fn()
	} as unknown as HTMLElement;
}

afterEach(() => {
	vi.useRealTimers();
});

describe('symbol card interactions', () => {
	it('opens against the original anchor and dismisses after the configured delay', () => {
		vi.useFakeTimers();
		const changes = vi.fn();
		const anchor = createAnchor();
		const interactions = createSymbolCardInteractions({
			panelId: 'symbol-card',
			selector: '[data-symbol]',
			read: (target) => target === anchor ? { path: 'upwell::App' } : undefined,
			onChange: changes,
			closeDelay: 40
		});

		interactions.open(anchor);
		interactions.scheduleDismiss();
		vi.advanceTimersByTime(39);

		expect(interactions.active).toEqual({ data: { path: 'upwell::App' }, anchor });
		expect(changes).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(1);

		expect(interactions.active).toBeUndefined();
		expect(changes).toHaveBeenLastCalledWith(undefined);
	});

	it('cancels pending dismissal when the pointer or focus enters the card', () => {
		vi.useFakeTimers();
		const anchor = createAnchor();
		const card = new EventTarget() as HTMLElement;
		const interactions = createSymbolCardInteractions({
			panelId: 'symbol-card',
			selector: '[data-symbol]',
			read: () => ({ path: 'upwell::App' }),
			onChange: vi.fn(),
			closeDelay: 40
		});
		const detach = interactions.card(card);

		interactions.open(anchor);
		interactions.scheduleDismiss();
		card.dispatchEvent(new Event('mouseenter'));
		vi.advanceTimersByTime(40);

		expect(interactions.active?.anchor).toBe(anchor);

		interactions.scheduleDismiss();
		card.dispatchEvent(new Event('focusin'));
		vi.advanceTimersByTime(40);

		expect(interactions.active?.anchor).toBe(anchor);
		detach?.();
	});

	it('replaces pending timers and clears them during cleanup', () => {
		vi.useFakeTimers();
		const changes = vi.fn();
		const interactions = createSymbolCardInteractions({
			panelId: 'symbol-card',
			selector: '[data-symbol]',
			read: () => ({ path: 'upwell::App' }),
			onChange: changes,
			closeDelay: 40
		});

		interactions.open(createAnchor());
		interactions.scheduleDismiss();
		vi.advanceTimersByTime(20);
		interactions.scheduleDismiss();
		vi.advanceTimersByTime(20);

		expect(interactions.active).toBeDefined();

		interactions.destroy();
		vi.runAllTimers();

		expect(interactions.active).toBeDefined();
		expect(changes).toHaveBeenCalledTimes(1);
	});

	it('restores focus to the trigger when dismissed from card content', () => {
		const anchor = createAnchor();
		const interactions = createSymbolCardInteractions({
			panelId: 'symbol-card',
			selector: '[data-symbol]',
			read: () => ({ path: 'upwell::App' }),
			onChange: vi.fn()
		});

		interactions.open(anchor);
		interactions.dismiss(true);

		expect(anchor.focus).toHaveBeenCalledOnce();
	});

	it('resets the previous trigger before opening a new one', () => {
		const first = createAnchor();
		const second = createAnchor();
		const interactions = createSymbolCardInteractions({
			panelId: 'symbol-card',
			selector: '[data-symbol]',
			read: (target) => target === first ? { path: 'upwell::First' } : { path: 'upwell::Second' },
			onChange: vi.fn()
		});

		interactions.open(first);
		interactions.open(second);

		expect(first.getAttribute('aria-controls')).toBeNull();
		expect(first.getAttribute('aria-expanded')).toBeNull();
		expect(second.getAttribute('aria-controls')).toBe('symbol-card');
		expect(second.getAttribute('aria-expanded')).toBe('true');
		expect(second.getAttribute('aria-haspopup')).toBe('dialog');
		expect(interactions.active?.anchor).toBe(second);
	});

});
