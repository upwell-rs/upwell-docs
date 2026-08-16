<!--
	Alternative versions of the same content, one shown at a time.

	For the case documentation genuinely has: the same task done two ways — two protocols, two
	transports, a macro and its expansion — where showing both at once makes the page twice as long
	and implies the reader needs both.

	**Not** for content a reader may need more than one of. Anything hidden behind a tab is invisible
	to the browser's in-page find and to anyone skimming, so a tab is a claim that the other panels
	are irrelevant once you have chosen. If both halves matter, they are two sections.

	The tab list follows the WAI tabs pattern, because that is what assistive technology expects here
	and the behaviour is specific: arrow keys move between tabs while Tab leaves the list entirely, so
	a keyboard user is not made to walk through every tab to reach the content.

	Every panel is rendered and kept in the DOM, hidden with `hidden` rather than unmounted. Code
	blocks are prerendered with their symbol metadata already attached, and a panel that mounts on
	first click would have to be hydrated to get it — so keeping them costs markup and saves the whole
	mechanism. It also means the content is in the page for anyone reading it without JavaScript.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Tab labels, in order. Panels are matched to them by position. */
		labels: readonly string[];
		/** Which tab opens first, by label. Defaults to the first. */
		initial?: string;
		/**
		 * The panels, as a snippet per tab.
		 *
		 * Taken as a list of snippets rather than as children with markers, so a page cannot write
		 * three labels and two panels without it being obvious at the call site.
		 */
		panels: readonly Snippet[];
	}

	let { labels, initial, panels }: Props = $props();

	/**
	 * The tab the reader picked, if they have picked one.
	 *
	 * Kept separate from the default rather than initialised from it, so `initial` stays live: a page
	 * that computes which tab to open gets that, right up until the reader chooses for themselves.
	 */
	let chosen = $state<number>();
	let tabs = $state<HTMLElement>();

	const selected = $derived(chosen ?? Math.max(0, initial ? labels.indexOf(initial) : 0));

	/**
	 * Arrow keys move between tabs, Home and End jump to the ends.
	 *
	 * Focus follows the selection, which is what makes the pattern work for a keyboard: the reader
	 * moves along the list and each tab opens as they arrive, without a second key to confirm.
	 */
	function onkeydown(event: KeyboardEvent): void {
		const last = labels.length - 1;
		const moves: Record<string, number | undefined> = {
			ArrowRight: selected === last ? 0 : selected + 1,
			ArrowLeft: selected === 0 ? last : selected - 1,
			Home: 0,
			End: last
		};

		const next = moves[event.key];

		if (next === undefined) {
			return;
		}

		event.preventDefault();
		chosen = next;
		tabs?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
	}
</script>

<div class="tabs">
	<div bind:this={tabs} class="tabs__list" role="tablist">
		{#each labels as label, index (label)}
			<button
				class="tabs__tab"
				type="button"
				role="tab"
				id="tab-{label}"
				aria-selected={index === selected}
				aria-controls="panel-{label}"
				tabindex={index === selected ? 0 : -1}
				onclick={() => (chosen = index)}
				{onkeydown}
			>{label}</button>
		{/each}
	</div>

	{#each panels as panel, index (labels[index] ?? index)}
		<div
			class="tabs__panel"
			role="tabpanel"
			id="panel-{labels[index]}"
			aria-labelledby="tab-{labels[index]}"
			hidden={index !== selected}
		>
			{@render panel()}
		</div>
	{/each}
</div>

<style>
	.tabs {
		margin: 1.25rem 0;
	}

	.tabs__list {
		display: flex;
		gap: 0.25rem;
		overflow-x: auto;
		border-bottom: 1px solid var(--border);
		scrollbar-width: none;
	}

	.tabs__list::-webkit-scrollbar {
		display: none;
	}

	.tabs__tab {
		padding: 0.4rem 0.75rem;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
		font: inherit;
		font-size: 0.875rem;
		white-space: nowrap;
	}

	.tabs__tab:hover {
		color: var(--text);
	}

	.tabs__tab[aria-selected='true'] {
		border-bottom-color: var(--accent);
		color: var(--accent);
		font-weight: 500;
	}

	.tabs__tab:focus-visible {
		border-radius: calc(var(--radius) - 2px);
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	/* The first block inside a panel sits against the tab list rather than below its own margin. */
	.tabs__panel > :global(:first-child) {
		margin-top: 0.875rem;
	}

	.tabs__panel > :global(:last-child) {
		margin-bottom: 0;
	}
</style>
