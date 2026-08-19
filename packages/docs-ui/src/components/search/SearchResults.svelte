<script lang="ts">
	import type { SearchStatus } from '../../search/index.svelte.ts';
	import type { SearchResult } from '../../search/rank.ts';
	import SearchResultItem from './SearchResultItem.svelte';

	interface Props {
		id: string;
		optionIdPrefix: string;
		results: readonly SearchResult[];
		selected: number;
		status: SearchStatus;
		query: string;
		filter: string | null;
		limit: number;
		degraded: boolean;
		onactive: (index: number) => void;
		onselect: () => void;
	}

	let { id, optionIdPrefix, results, selected, status, query, filter, limit, degraded, onactive, onselect }: Props = $props();

	const liveStatus = $derived.by(() => {
		if (status === 'loading') {
			return 'Loading search results.';
		}

		if (status === 'failed') {
			return 'The search index could not be loaded.';
		}

		if (query.trim() === '') {
			return '';
		}

		if (results.length === 0) {
			return 'No search results.';
		}

		const count = `${results.length}${results.length === limit ? ' or more' : ''}`;
		const kind = filter ? ` for ${filter}` : '';

		return `${count} search ${results.length === 1 ? 'result' : 'results'}${kind}.`;
	});

	function keepActiveOptionVisible(list: HTMLElement): void {
		list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
	}
</script>

<p class="search__status" role="status" aria-live="polite" aria-atomic="true">{liveStatus}</p>

{#if status === 'loading'}
	<p class="search__note">Loading…</p>
{:else if status === 'failed'}
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
		{results.length}{results.length === limit ? '+' : ''}
		{results.length === 1 ? 'result' : 'results'}
	</p>
{/if}

<!-- Position is the identity because duplicate destinations are valid and each query rebuilds the list. -->
<ul
	{@attach (list) => {
		void selected;
		void results;
		keepActiveOptionVisible(list);
	}}
	class="search__results"
	{id}
	role="listbox"
	aria-label="Search results"
	hidden={results.length === 0}
>
	{#each results as result, index (index)}
		<SearchResultItem
			{result}
			id={`${optionIdPrefix}-${index}`}
			selected={index === selected}
			onactive={() => onactive(index)}
			{onselect}
		/>
	{/each}
</ul>

{#if degraded}
	<p class="search__note" data-degraded="true">
		This release has no prepared artifact, so framework symbols are not searchable.
	</p>
{/if}

<style>
	.search__status {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
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
</style>
