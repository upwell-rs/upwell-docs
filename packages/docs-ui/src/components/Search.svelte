<!--
	Search over the guides, symbol pages and framework symbols of the release being read.

	A `<dialog>` rather than a hand-built overlay: it takes focus, traps it, closes on Escape, and
	renders in the top layer above anything else on the page — all behaviour that is tedious to
	reproduce and easy to get subtly wrong.

	The field is `type="text"` with a searchbox role, **not** `type="search"`. Chrome gives a search
	input its own Escape handling — it clears the field and consumes the event — so with `type=search`
	Escape emptied the query and left the dialog open, which is exactly not what pressing Escape in a
	dialog should do.

	The index is fetched when the dialog first opens, not on page load. A reader who never searches
	never downloads it.
-->
<script lang="ts">
	import Highlight from './Highlight.svelte';
	import { parseQuery } from '@upwell/docs-ui/search/query';
	import type { SearchIndex } from '../search/index.svelte.ts';
	import type { DocsVersion } from '../types.ts';

	interface Props {
		version: DocsVersion;
		searchIndex: SearchIndex;
		searchHref: (versionId: string) => string;
		navigate: (href: string, external: boolean) => void;
	}

	let { version, searchIndex, searchHref, navigate }: Props = $props();

	let dialog = $state<HTMLDialogElement>();
	let input = $state<HTMLInputElement>();
	let list = $state<HTMLElement>();
	let query = $state('');
	let moved = $state(0);

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
	const selected = $derived(results.length === 0 ? 0 : Math.min(moved, results.length - 1));

	/**
	 * Keeps the highlighted result in view.
	 *
	 * Focus stays in the text field so the reader can keep typing, which means the browser never
	 * scrolls for them: it only follows focus. Arrow keys moved the highlight out of sight instead.
	 *
	 * `block: 'nearest'` scrolls the least that will do, so a result already visible does not jump,
	 * and only the list scrolls rather than the page behind it.
	 */
	$effect(() => {
		// Read both so the effect runs when the highlight moves and when the results change.
		void selected;
		void results;

		list?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
	});

	export function open(): void {
		dialog?.showModal();
		void searchIndex.load(version.id, searchHref(version.id));
		input?.focus();
		input?.select();
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
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			moved = results.length === 0 ? 0 : (selected + 1) % results.length;

			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			moved = results.length === 0 ? 0 : (selected - 1 + results.length) % results.length;

			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			choose(selected);
		}
	}

	const KIND_LABEL: Record<string, string> = {
		guide: 'Guide',
		'symbol-page': 'Reference',
		symbol: 'Symbol'
	};
</script>

<dialog bind:this={dialog} class="search" onclose={() => { query = ''; moved = 0; }}>
	<!-- Clicking the backdrop closes; clicks inside the panel must not bubble out to it. -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="search__backdrop" onclick={close}></div>

	<div class="search__panel">
		<input
			bind:this={input}
			bind:value={query}
			class="search__input"
			type="text"
			role="searchbox"
			placeholder="Search {version.label} documentation"
			aria-label="Search documentation"
			autocomplete="off"
			spellcheck="false"
			oninput={retype}
			{onkeydown}
		/>

		{#if searchIndex.status === 'loading'}
			<p class="search__note">Loading…</p>
		{:else if searchIndex.status === 'failed'}
			<p class="search__note">The search index could not be loaded.</p>
		{:else if query.trim() === ''}
			<p class="search__note">
				Search guides, reference pages and framework symbols. Narrow with
				<code>struct:</code>, <code>trait:</code>, <code>fn:</code>, <code>macro:</code> or
				<code>doc:</code>.
			</p>
		{:else if results.length === 0}
			<p class="search__note">Nothing matches “{query}”.</p>
		{:else}
			<p class="search__filter">
				{#if filter}Showing <code>{filter}</code> only ·{/if}
				{results.length}{results.length === LIMIT ? '+' : ''}
				{results.length === 1 ? 'result' : 'results'}
			</p>

			<!--
				Keyed by position, not by destination. Two results can legitimately share an `href`: a
				symbol with no page of its own links to its source line, and two struct fields declared
				on one line produce the same link. Keying by it crashed the whole dialog with a duplicate
				key. Position is the honest identity here anyway — the list is rebuilt from scratch on
				every keystroke, so nothing in it persists across queries to be identified.
			-->
			<ul bind:this={list} class="search__results">
				{#each results as result, index (index)}
					<li>
						<a
							class="search__result"
							href={result.href}
							rel={result.record.external ? 'noreferrer' : undefined}
							aria-current={index === selected ? 'true' : undefined}
							onmouseenter={() => (moved = index)}
							onclick={close}
						>
							<span class="search__kind">
								{KIND_LABEL[result.record.kind] ?? result.record.kind}
								{#if result.record.symbolKind}
									<span class="search__symbol-kind">{result.record.symbolKind.replace('_', ' ')}</span>
								{/if}
							</span>
							<span class="search__title">
								<Highlight text={result.record.title} ranges={result.titleRanges} />
							</span>
							{#if result.heading}
								<span class="search__heading">› {result.heading}</span>
							{/if}
							{#if result.record.detail}
								<span class="search__detail">
									<Highlight text={result.record.detail} ranges={result.detailRanges} />
								</span>
							{/if}
							{#if result.record.signature}
								<span class="search__signature">{result.record.signature}</span>
							{/if}
							{#if result.excerpt}
								<span class="search__excerpt">
									<Highlight text={result.excerpt} ranges={result.excerptRanges} />
								</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{/if}

		{#if searchIndex.degraded}
			<p class="search__note" data-degraded="true">
				This release has no prepared artifact, so framework symbols are not searchable.
			</p>
		{/if}
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

	.search__input {
		padding: 0.875rem 1rem;
		border: none;
		border-bottom: 1px solid var(--border);
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 1rem;
	}

	.search__input:focus {
		outline: none;
	}

	.search__note {
		margin: 0;
		padding: 1rem;
		color: var(--text-subtle);
		font-size: 0.875rem;
	}

	.search__note code,
	.search__filter code {
		padding: 0.05em 0.3em;
		border-radius: 3px;
		background: var(--surface-sunken);
		font-family: var(--font-mono);
		font-size: 0.8125em;
	}

	.search__filter {
		margin: 0;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--border);
		color: var(--text-subtle);
		font-size: 0.75rem;
	}

	.search__note[data-degraded='true'] {
		border-top: 1px solid var(--border);
		padding: 0.625rem 1rem;
		font-size: 0.75rem;
	}

	.search__results {
		margin: 0;
		padding: 0.375rem;
		overflow-y: auto;
		list-style: none;
	}

	/*
	 * The kind column is dropped below 30rem: five rem of a narrow screen spent on a label, with the
	 * title squeezed into what is left, is the wrong trade. The kind then sits above the title.
	 */
	.search__result {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0 0.75rem;
		padding: 0.5rem 0.625rem;
		border-radius: calc(var(--radius) - 2px);
		color: var(--text);
		text-decoration: none;
	}

	@media (min-width: 30rem) {
		.search__result {
			grid-template-columns: 5rem 1fr;
		}
	}

	.search__result[aria-current='true'] {
		background: var(--accent-surface);
	}

	.search__kind {
		color: var(--text-subtle);
		font-size: 0.6875rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		line-height: 1.6;
	}

	.search__title {
		font-weight: 500;
	}

	.search__heading,
	.search__detail,
	.search__excerpt,
	.search__signature {
		color: var(--text-muted);
		font-size: 0.8125rem;
	}

	@media (min-width: 30rem) {
		.search__kind {
			grid-row: 1;
		}

		.search__title,
		.search__heading,
		.search__detail,
		.search__excerpt,
		.search__signature {
			grid-column: 2;
		}
	}

	.search__signature {
		overflow: hidden;
		color: var(--text-subtle);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.search__symbol-kind {
		display: block;
		font-size: 0.9em;
		opacity: 0.75;
	}

	.search__detail {
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}

	.search__excerpt {
		color: var(--text-subtle);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
