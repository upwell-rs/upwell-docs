/**
 * Brings an element into view inside its own scroll container.
 *
 * `scrollIntoView` is the obvious call and the wrong one here: it walks every scrollable ancestor,
 * so revealing a sidebar entry also scrolls the reading pane and the document. The panes are pinned
 * and scroll independently, which is exactly the arrangement that makes that a visible jump.
 *
 * Nothing moves while the element is already inside the container's box, so navigating between two
 * adjacent entries does not shift the tree under the reader's eyes.
 */
export function revealWithin(target: HTMLElement | undefined, root: HTMLElement | undefined, margin = 24): void {
	const container = scrollableAncestor(root);

	if (!target || !container) {
		return;
	}

	const box = target.getBoundingClientRect();
	const view = container.getBoundingClientRect();

	if (box.top < view.top + margin) {
		container.scrollTop -= view.top + margin - box.top;

		return;
	}

	if (box.bottom > view.bottom - margin) {
		container.scrollTop += box.bottom - (view.bottom - margin);
	}
}

/** Finds the nearest ancestor that actually scrolls vertically, including the element itself. */
function scrollableAncestor(element: HTMLElement | undefined): HTMLElement | undefined {
	for (let node = element; node; node = node.parentElement ?? undefined) {
		const overflow = getComputedStyle(node).overflowY;

		if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) {
			return node;
		}
	}

	return undefined;
}
