<!--
	Search over the guides, symbol pages and framework symbols of the release being read.

	A `<dialog>` rather than a hand-built overlay: it takes focus, traps it, closes on Escape, and
	renders in the top layer above anything else on the page — all behaviour that is tedious to
	reproduce and easy to get subtly wrong.

	The field is `type="text"` with a combobox role, **not** `type="search"`. Chrome gives a search
	input its own Escape handling — it clears the field and consumes the event — so with `type=search`
	Escape emptied the query and left the dialog open, which is exactly not what pressing Escape in a
	dialog should do.

	The index is fetched when the dialog first opens, not on page load. A reader who never searches
	never downloads it.
-->
<script lang="ts">
	import { parseQuery } from '@upwell/docs-ui/search/query';
	import type { SearchIndex } from '../search/index.svelte.ts';
	import type { DocsVersion } from '../types.ts';
	import { clampSelection, moveSelection, type SearchNavigationKey } from './search/navigation.ts';
	import SearchInput from './search/SearchInput.svelte';
	import SearchResults from './search/SearchResults.svelte';

	interface Props {
		version: DocsVersion;
		searchIndex: SearchIndex;
		searchHref: (versionId: string) => string;
		navigate: (href: string, external: boolean) => void;
	}

	let { version, searchIndex, searchHref, navigate }: Props = $props();

	let dialog = $state<HTMLDialogElement>();
	let input = $state<SearchInput>();
	let query = $state('');
	let moved = $state(0);
	const id = $props.id();
	const resultsId = `${id}-results`;
	const optionIdPrefix = `${id}-option`;

	/**
	 * How many results are kept.
	 *
	 * Well above what fits on screen, because a kind filter is a *browse*: `trait:` with no text is a
	 * reader looking through the framework's traits, and capping that at a dozen makes the feature
	 * pointless. The list scrolls, and the highlighted result is kept in view.
	 */
	const LIMIT = 100;

	const results = $derived(searchIndex.query(query, LIMIT));

	/** The kind filter in effect, if the reader typed one, so the dialog can say so. */
	const filter = $derived(parseQuery(query).filter);

	/**
	 * The highlighted result.
	 *
	 * Clamped when read rather than corrected in an effect: results change as the reader types, and
	 * writing state from an effect to keep an index in range is a loop waiting to happen.
	 */
	const selected = $derived(clampSelection(moved, results.length));
	const activeOptionId = $derived(results.length === 0 ? undefined : `${optionIdPrefix}-${selected}`);

	function captureDialog(element: HTMLDialogElement): void {
		dialog = element;
	}

	export function open(): void {
		dialog?.showModal();
		void searchIndex.load(version.id, searchHref(version.id));
		input?.focusAndSelect();
	}

	function close(): void {
		dialog?.close();
	}

	/** A new query starts from the top; otherwise the highlight lands somewhere arbitrary. */
	function retype(): void {
		moved = 0;
	}

	function choose(index: number): void {
		const result = results[index];

		if (!result) {
			return;
		}

		close();

		navigate(result.href, Boolean(result.record.external));
	}

	/**
	 * Arrow keys move the selection; Enter opens it.
	 *
	 * Handled here rather than by making each result focusable, so the text field keeps focus and a
	 * reader can keep typing while moving through what they have found.
	 */
	function onkeydown(event: KeyboardEvent): void {
		if (isNavigationKey(event.key)) {
			event.preventDefault();
			moved = moveSelection(event.key, selected, results.length);

			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			choose(selected);
		}
	}

	function isNavigationKey(key: string): key is SearchNavigationKey {
		return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
	}
</script>

<dialog {@attach captureDialog} class="search" onclose={() => { query = ''; moved = 0; }}>
	<!-- Clicking the backdrop closes; clicks inside the panel must not bubble out to it. -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="search__backdrop" onclick={close}></div>

	<div class="search__panel">
		<SearchInput
			bind:this={() => input, (component) => (input = component)}
			bind:value={query}
			label={`Search ${version.label} documentation`}
			{resultsId}
			expanded={results.length > 0}
			{activeOptionId}
			oninput={retype}
			{onkeydown}
		/>
		<SearchResults
			id={resultsId}
			{optionIdPrefix}
			{results}
			{selected}
			status={searchIndex.status}
			{query}
			{filter}
			limit={LIMIT}
			degraded={searchIndex.degraded}
			onactive={(index) => (moved = index)}
			onselect={close}
		/>
	</div>
</dialog>

<style>
	.search {
		max-width: none;
		max-height: none;
		width: 100vw;
		height: 100dvh;
		padding: 0;
		border: none;
		background: none;
		overflow: visible;
	}

	.search::backdrop {
		background: color-mix(in srgb, var(--shadow) 40%, transparent);
	}

	.search__backdrop {
		position: fixed;
		inset: 0;
	}

	/*
	 * Nearly full height on a phone, a centred panel on a laptop.
	 *
	 * The desktop `4rem` inset is most of the screen on a small one, and a 30rem cap leaves a search
	 * dialog showing three results above an expanse of dimmed page. On mobile the panel takes the
	 * space it can, which is the difference between search being usable there and being a novelty.
	 */
	.search__panel {
		position: relative;
		width: min(40rem, calc(100vw - 1rem));
		max-height: calc(100dvh - 2rem);
		margin: 1rem auto 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		box-shadow: 0 16px 48px color-mix(in srgb, var(--shadow) 45%, transparent);
	}

	@media (min-width: 40rem) {
		.search__panel {
			width: min(40rem, calc(100vw - 2rem));
			max-height: min(32rem, calc(100dvh - 8rem));
			margin: 4rem auto 0;
		}
	}

</style>
