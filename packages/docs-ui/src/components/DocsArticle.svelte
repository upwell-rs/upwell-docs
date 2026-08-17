<!--
	The rendered page body, plus the behaviour its static markup needs.

	Code blocks arrive fully rendered from the build: highlighted, with symbol metadata already on the
	tokens. Nothing here re-highlights or fetches. It only attaches the two behaviours that markup
	cannot express — copying a block, and showing a symbol's card — using delegated listeners, so the
	cost is constant regardless of how much code a page contains.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	import { getDocsNotifier } from '../context.ts';
	import SymbolCard, { type SymbolCardData } from './SymbolCard.svelte';

	interface Props {
		/** Bound so the table of contents can read the rendered headings back out. */
		element?: HTMLElement;
		children: Snippet;
	}

	let { element = $bindable(), children }: Props = $props();
	const notifier = getDocsNotifier();

	let active = $state<{ data: SymbolCardData; anchor: HTMLElement } | undefined>();
	let card = $state<HTMLElement>();

	/**
	 * Grace period before a card closes.
	 *
	 * The card carries links — to the symbol's page and to its source — and reaching them means
	 * moving the pointer off the token and across a gap. Closing on `mouseout` made those links
	 * unreachable by mouse. The delay is cancelled whenever the pointer arrives somewhere that should
	 * keep the card open: the token itself, or the card.
	 */
	const CLOSE_DELAY_MS = 160;

	let closing: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Reads a local's card out of its token.
	 *
	 * A variable carries less than a symbol — there is no signature for `app`, only for the type it
	 * holds — so the card is the type's summary under a `name: Type` heading, and links to the type's
	 * page when the site has one.
	 */
	function readVariable(target: HTMLElement): SymbolCardData | undefined {
		const type = target.dataset.variableType;

		if (!type) {
			return undefined;
		}

		const href = target.dataset.variableHref;

		return {
			path: type,
			kind: target.dataset.variableKind ?? 'item',
			summary: target.dataset.variableDoc,
			variable: target.dataset.variable,
			// A local holding another crate's type says so, and its link leaves the site — the same
			// distinction a bare external token makes.
			externalCrate: target.dataset.variableCrate,
			documentedAt:
				href && !target.dataset.variableCrate ? { href, title: type.split('::').pop() ?? type } : undefined,
			sourceHref: target.dataset.variableCrate ? href : undefined
		};
	}

	function readSymbol(target: HTMLElement): SymbolCardData | undefined {
		const path = target.dataset.symbol;

		if (!path) {
			return undefined;
		}

		const href = target.getAttribute('href');

		return {
			path,
			kind: target.dataset.symbolKind ?? 'item',
			signature: target.dataset.symbolSignature,
			summary: target.dataset.symbolDoc,
			feature: target.dataset.symbolFeature,
			deprecated: target.dataset.symbolDeprecated,
			sourceHref: target.dataset.symbolSource,
			// The destination was resolved at build time against the hand-written symbol pages, so the
			// card only has to read it back rather than look anything up.
			documentedAt: href ? { href, title: target.dataset.symbolDocsTitle ?? 'Documentation' } : undefined
		};
	}

	function cancelClose(): void {
		clearTimeout(closing);
		closing = undefined;
	}

	function scheduleClose(): void {
		cancelClose();

		closing = setTimeout(() => {
			active = undefined;
		}, CLOSE_DELAY_MS);
	}

	/**
	 * Reads the card for a name the snippet declared itself.
	 *
	 * There is no crate, no feature and no source link — the definition is a few lines away, and
	 * saying so is the whole content of the card.
	 */
	function readLocal(target: HTMLElement): SymbolCardData | undefined {
		const name = target.dataset.local;

		if (!name) {
			return undefined;
		}

		return {
			path: name,
			kind: target.dataset.localKind ?? 'item',
			signature: target.dataset.localSignature,
			summary: target.dataset.localDoc,
			definedInPage: `Defined on line ${target.dataset.localLine} of this example`
		};
	}

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
	 * Reads the card for a type from another crate.
	 *
	 * All the site knows is the path, the kind and where it is documented — the external tier records
	 * nothing else on purpose, because indexing 554 crates properly is not possible and knowing that
	 * `Arc` is a struct in `std` is most of the value anyway.
	 */
	function readExternal(target: HTMLElement): SymbolCardData | undefined {
		const path = target.dataset.external;

		if (!path) {
			return undefined;
		}

		const href = target.getAttribute('href');

		return {
			path,
			kind: target.dataset.externalKind ?? 'item',
			externalCrate: target.dataset.externalCrate,
			// Present for the standard library, absent for everything else — the card simply shows
			// less rather than showing a placeholder where documentation would be.
			summary: target.dataset.externalDoc,
			signature: target.dataset.externalSignature,
			sourceHref: href ?? undefined
		};
	}

	/** Every token a card can open for. */
	const ANNOTATED = '[data-symbol], [data-variable], [data-local], [data-external]';

	function open(event: Event): void {
		const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(ANNOTATED);

		if (!target) {
			return;
		}

		const data = readSymbol(target) ?? readVariable(target) ?? readLocal(target) ?? readExternal(target);

		if (data) {
			cancelClose();
			active = { data, anchor: target };
		}
	}

	/** Leaving a token only *schedules* a close, so moving towards the card is not a dismissal. */
	function leave(event: Event): void {
		if ((event.target as HTMLElement | null)?.closest(ANNOTATED)) {
			scheduleClose();
		}
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
			cancelClose();
			active = undefined;
		}
	}

	/**
	 * Listeners are attached imperatively rather than as markup attributes.
	 *
	 * They are event delegation for the static code markup inside, not behaviour of the article
	 * element itself — the interactive targets are the copy buttons and symbol links the build
	 * emitted, and each is already a `button` or an `a`. Declaring the handlers on `<article>` would
	 * claim it is interactive, which it is not.
	 */
	$effect(() => {
		const host = element;

		if (!host) {
			return;
		}

		host.addEventListener('click', copy);
		host.addEventListener('click', jump);
		host.addEventListener('mouseover', open);
		host.addEventListener('mouseout', leave);
		host.addEventListener('focusin', open);
		host.addEventListener('focusout', leave);

		return () => {
			host.removeEventListener('click', copy);
			host.removeEventListener('click', jump);
			host.removeEventListener('mouseover', open);
			host.removeEventListener('mouseout', leave);
			host.removeEventListener('focusin', open);
			host.removeEventListener('focusout', leave);
			cancelClose();
		};
	});

	/** Keeps the card open while the pointer or focus is inside it. */
	$effect(() => {
		const host = card;

		if (!host) {
			return;
		}

		host.addEventListener('mouseenter', cancelClose);
		host.addEventListener('mouseleave', scheduleClose);
		host.addEventListener('focusin', cancelClose);
		host.addEventListener('focusout', scheduleClose);

		return () => {
			host.removeEventListener('mouseenter', cancelClose);
			host.removeEventListener('mouseleave', scheduleClose);
			host.removeEventListener('focusin', cancelClose);
			host.removeEventListener('focusout', scheduleClose);
		};
	});
</script>

<svelte:window onkeydown={dismiss} />

<article bind:this={element} class="prose">
	{@render children()}
</article>

{#if active}
	<SymbolCard bind:element={card} data={active.data} anchor={active.anchor} />
{/if}
