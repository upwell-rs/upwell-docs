<!--
	The draggable divider between a fixed-width pane and the content beside it.

	Reports a width rather than applying one. The pane's width belongs to whoever remembers it across
	navigations, so this component owns only the gesture: it never writes to the DOM node it resizes.

	Both input methods are real. Pointer drag is what most readers reach for, but a divider that only
	responds to dragging is unusable without a mouse, so the handle is focusable and the arrow keys
	move it — this is the ARIA window splitter pattern, which is why the role is `separator` with a
	value rather than a `button`.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';

	interface Props {
		/** Current pane width in pixels. */
		width: number;
		min: number;
		max: number;
		/** Width restored by double-clicking the divider. */
		defaultWidth: number;
		/** Names what is being resized, for assistive technology. */
		label: string;
		onwidth: (pixels: number) => void;
	}

	let { width, min, max, defaultWidth, label, onwidth }: Props = $props();

	let dragging = $state(false);
	let origin = 0;
	let startWidth = 0;
	let pointer: number | undefined;
	let frame: number | undefined;
	let pending: number | undefined;

	/** One arrow press. Coarse enough to be worth pressing, fine enough to land on a chosen width. */
	const STEP = 16;

	/**
	 * Starts a drag, taking the pointer with it.
	 *
	 * `preventDefault` is what stops the gesture from also starting a text selection across the page,
	 * and pointer capture is what keeps the divider following a pointer that has moved off it — a
	 * drag is fast and the pointer routinely leaves an eight-pixel target. Because preventing the
	 * default also suppresses focus, focus is taken explicitly, so a reader who drags the handle can
	 * then fine-tune it with the arrow keys.
	 */
	function begin(event: PointerEvent): void {
		const handle = event.currentTarget as HTMLElement;

		if (!event.isPrimary || event.button !== 0 || dragging) {
			return;
		}

		event.preventDefault();

		dragging = true;
		pointer = event.pointerId;
		origin = event.clientX;
		startWidth = width;

		handle.setPointerCapture(event.pointerId);
		handle.focus();
		document.documentElement.dataset.resizingPane = 'true';
	}

	function drag(event: PointerEvent): void {
		if (!dragging || event.pointerId !== pointer) {
			return;
		}

		pending = clamp(startWidth + event.clientX - origin);

		if (frame === undefined) {
			frame = requestAnimationFrame(flush);
		}
	}

	function end(event: PointerEvent): void {
		if (event.pointerId !== pointer) {
			return;
		}

		flush();
		dragging = false;
		pointer = undefined;
		delete document.documentElement.dataset.resizingPane;
	}

	function flush(): void {
		if (frame !== undefined) {
			cancelAnimationFrame(frame);
			frame = undefined;
		}

		if (pending !== undefined) {
			onwidth(pending);
			pending = undefined;
		}
	}

	function clamp(value: number): number {
		return Math.round(Math.min(Math.max(value, min), max));
	}

	function nudge(event: KeyboardEvent): void {
		const moves: Record<string, number | undefined> = {
			ArrowLeft: width - STEP,
			ArrowRight: width + STEP,
			Home: min,
			End: max
		};
		const next = moves[event.key];

		if (next === undefined) {
			return;
		}

		event.preventDefault();
		onwidth(clamp(next));
	}

	function reset(): void {
		onwidth(clamp(defaultWidth));
	}

	onDestroy(() => {
		if (frame !== undefined) {
			cancelAnimationFrame(frame);
		}

		if (typeof document !== 'undefined') {
			delete document.documentElement.dataset.resizingPane;
		}
	});
</script>

<!--
	A `separator` is non-interactive until it is focusable, at which point it becomes the window
	splitter widget and takes both a tab stop and key handling. The checker only knows the first half
	of that rule, so the two warnings it raises here are the pattern working as specified.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="resizer"
	class:resizer--dragging={dragging}
	role="separator"
	aria-orientation="vertical"
	aria-label={label}
	aria-valuenow={width}
	aria-valuemin={min}
	aria-valuemax={max}
	aria-valuetext={`${width} pixels`}
	title="Drag to resize · Double-click to reset"
	tabindex="0"
	onpointerdown={begin}
	onpointermove={drag}
	onpointerup={end}
	onpointercancel={end}
	onlostpointercapture={end}
	onkeydown={nudge}
	ondblclick={reset}
></div>

<style>
	/*
	 * The divider is a hairline that widens its *hit area* rather than its appearance: the visible
	 * rule is one pixel, while the element itself is wide enough to grab. Hence the transparent
	 * padding and the border drawn on the inner pseudo-element.
	 */
	.resizer {
		position: relative;
		width: 100%;
		height: 100%;
		cursor: col-resize;
		touch-action: none;
		user-select: none;
	}

	.resizer::before,
	.resizer::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
	}

	.resizer::before {
		width: 1px;
		background: var(--border);
	}

	.resizer::after {
		width: 2px;
		background: var(--accent);
		opacity: 0;
		transition: opacity 120ms ease;
	}

	.resizer:hover::after,
	.resizer:focus-visible::after,
	.resizer--dragging::after {
		opacity: 1;
	}

	.resizer:focus-visible {
		outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
		outline-offset: -2px;
	}

	:global(html[data-resizing-pane='true']),
	:global(html[data-resizing-pane='true'] *) {
		cursor: col-resize !important;
		user-select: none !important;
	}

	@media (prefers-reduced-motion: reduce) {
		.resizer::after {
			transition: none;
		}
	}
</style>
