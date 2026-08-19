<!--
	The rendered page body, plus the behaviour its static markup needs.

	Code blocks arrive fully rendered from the build: highlighted, with symbol metadata already on the
	tokens. Nothing here re-highlights or fetches. It only attaches the two behaviours that markup
	cannot express — copying a block, and showing a symbol's card — using delegated listeners, so the
	cost is constant regardless of how much code a page contains.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';

	import { getDocsNotifier } from '../context.ts';
	import SymbolCard from './SymbolCard.svelte';
	import { createSymbolCardInteractions, type ActiveSymbolCard } from './symbol-card/interactions.ts';
	import { readSymbolCardData, SYMBOL_CARD_TARGET_SELECTOR } from './symbol-card/data.ts';

	interface Props {
		/** Bound so the table of contents can read the rendered headings back out. */
		element?: HTMLElement;
		children: Snippet;
	}

	let { element = $bindable(), children }: Props = $props();
	const notifier = getDocsNotifier();

	let active = $state<ActiveSymbolCard>();
	const id = $props.id();
	const symbolCardId = `symbol-card-${id}`;
	const symbolCards = createSymbolCardInteractions({
		panelId: symbolCardId,
		selector: SYMBOL_CARD_TARGET_SELECTOR,
		read: readSymbolCardData,
		onChange: (next) => {
			active = next;
		}
	});

	/**
	 * Jumps to where a local name was declared.
	 *
	 * Done in script rather than as an anchor so the URL is untouched: this is a movement within one
	 * code block, not a location worth putting in the reader's history and back button.
	 */
	function jump(event: Event): void {
		const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-local]');
		const { localBlock, localLine } = target?.dataset ?? {};

		if (!localBlock || !localLine) {
			return;
		}

		const line = element?.querySelector<HTMLElement>(`#L${localBlock}-${localLine}`);

		if (!line) {
			return;
		}

		line.scrollIntoView({ block: 'center', behavior: 'smooth' });
		line.dataset.jumped = 'true';

		// Removed once it has been noticed, so the highlight marks the arrival rather than becoming a
		// permanent decoration on that line.
		setTimeout(() => delete line.dataset.jumped, 1600);
	}

	/**
	 * Copies a code block, confirming on the button *and* as a toast.
	 *
	 * Both, deliberately. The button label is where the reader is looking, so it answers immediately;
	 * the toast is what an assistive technology announces, and what a reader who has already scrolled
	 * past still sees. A failure especially needs the toast, because a two-word button label cannot
	 * say what to do instead.
	 */
	async function copy(event: Event): Promise<void> {
		const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-copy]');
		const code = button?.parentElement?.querySelector('pre');

		if (!button || !code) {
			return;
		}

		const text = code.textContent ?? '';

		try {
			await navigator.clipboard.writeText(text);
			button.textContent = 'Copied';
			notifier?.copied(caption(button, text));
		} catch {
			button.textContent = 'Copy failed';
			notifier?.copyFailed();
		}

		setTimeout(() => {
			button.textContent = 'Copy';
		}, 2000);
	}

	/** Names the copied block: its caption if it has one, otherwise its first line. */
	function caption(button: HTMLElement, text: string): string {
		const label = button.parentElement?.querySelector('.code-block__caption')?.textContent?.trim();

		if (label) {
			return label;
		}

		const first = text.split('\n', 1)[0].trim();

		return first.length > 48 ? `${first.slice(0, 47)}…` : first;
	}

	function dismiss(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			symbolCards.dismiss(true);
		}
	}

	const articleInteractions: Attachment<HTMLElement> = (host) => {
		const detachSymbolCards = symbolCards.targets(host);

		host.addEventListener('click', copy);
		host.addEventListener('click', jump);

		return () => {
			host.removeEventListener('click', copy);
			host.removeEventListener('click', jump);
			detachSymbolCards?.();
		};
	};

	const captureArticle: Attachment<HTMLElement> = (host) => {
		element = host;

		return () => {
			if (element === host) {
				element = undefined;
			}
		};
	};
</script>

<svelte:window onkeydown={dismiss} />

<article class="prose" {@attach captureArticle} {@attach articleInteractions}>
	{@render children()}
</article>

{#if active}
	<SymbolCard id={symbolCardId} data={active.data} anchor={active.anchor} interaction={symbolCards.card} />
{/if}
