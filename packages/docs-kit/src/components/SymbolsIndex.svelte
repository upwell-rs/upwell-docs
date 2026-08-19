<!--
	The index of every documented symbol in one release.

	The list is virtualized because it is the largest thing the site renders: a release has thousands
	of symbols, and every one of them as a live list item is tens of thousands of DOM nodes for the
	dozen a reader can see. Rows are measured rather than assumed, since a summary wraps to one, two,
	or three lines.

	The consequence worth knowing: only the rendered window exists in the document, so the browser's
	own find cannot search the whole list. The filter above it is the tool for that, and it searches
	paths and summaries rather than the visible text alone.
-->
<script lang="ts">
	import { createVirtualizer, elementScroll, observeElementOffset, observeElementRect } from '@tanstack/svelte-virtual';
	import { get } from 'svelte/store';

	import { filterSymbolRecords, type SymbolRecord } from './symbols-index/filter-symbol-records.ts';
	import SymbolIndexFilters from './symbols-index/SymbolIndexFilters.svelte';
	import SymbolIndexRow from './symbols-index/SymbolIndexRow.svelte';

	interface Props {
		source: { readonly crate: string };
		records: readonly SymbolRecord[];
		sources: readonly { readonly name: string; readonly version: string; readonly href: string }[];
	}

	let { source, records, sources }: Props = $props();
	let query = $state('');
	let crate = $state('all');
	let scroller = $state<HTMLElement>();

	const ROW_ESTIMATE = 84;
	const crates = $derived([...new Set(records.map((record) => record.crate))].sort());
	const visible = $derived(filterSymbolRecords(records, query, crate));

	/**
	 * The complete option set, named in one place.
	 *
	 * `setOptions` is handed all of it every time rather than the one field that changed. Only the
	 * count changes, but an update naming the count alone would leave the observation and scrolling
	 * callbacks to whatever the adapter merges in for its own defaults, and those callbacks are what
	 * make the list follow its scroll box at all.
	 */
	function virtualizerOptions(count: number) {
		return {
			count,
			getScrollElement: () => scroller ?? null,
			estimateSize: () => ROW_ESTIMATE,
			overscan: 6,
			observeElementRect,
			observeElementOffset,
			scrollToFn: elementScroll
		};
	}

	const rows = createVirtualizer<HTMLElement, HTMLLIElement>(virtualizerOptions(0));

	/**
	 * Tells the virtualizer how many rows exist, which filtering changes.
	 *
	 * `get` rather than `$rows`, and this is the whole reason: `setOptions` writes to the same store,
	 * so reading it here would make the effect depend on its own write and run until Svelte stops it.
	 * The count is what this effect is about, and that is the only thing it should follow.
	 */
	$effect(() => {
		get(rows).setOptions(virtualizerOptions(visible.length));
	});

	// A filter that shortens the list leaves the reader scrolled past the end of it, looking at
	// nothing. The results start again from the top whenever the query or the crate changes.
	$effect(() => {
		void query;
		void crate;

		scroller?.scrollTo({ top: 0 });
	});

	/**
	 * Measures a row, so a two-line summary is not laid out as a one-line one.
	 *
	 * The virtualizer tracks rows by their `data-index` and observes them itself, so an action that
	 * hands over the element is the whole contract — there is nothing to undo when the row scrolls
	 * out and unmounts.
	 */
	function measure(element: HTMLLIElement): void {
		get(rows).measureElement(element);
	}
</script>

<header class="hero">
	<p class="eyebrow">Reference</p>
	<h1>{source.crate}</h1>
	<p class="lede">Look up one known framework symbol. Each page focuses on its declaration, syntax, usage, and generated API facts.</p>
</header>

{#if sources.length > 1}
	<nav class="sources" aria-label="Symbol repositories">
		{#each sources as item (item.name)}
			<a href={item.href} aria-current={item.name === source.crate ? 'page' : undefined}>
				<code>{item.name}</code>
				<span>{item.version}</span>
			</a>
		{/each}
	</nav>
{/if}

<SymbolIndexFilters {crates} bind:query bind:crate />

<p class="count">{visible.length} {visible.length === 1 ? 'symbol' : 'symbols'}</p>

<div bind:this={scroller} class="results">
	<ul class="symbols" aria-label="Symbol results" style={`height: ${$rows.getTotalSize()}px`}>
		{#each $rows.getVirtualItems() as row (visible[row.index]?.path ?? row.key)}
			{@const record = visible[row.index]}
			{#if record}
				<li use:measure data-index={row.index} style={`transform: translateY(${row.start}px)`}>
					<SymbolIndexRow {record} />
				</li>
			{/if}
		{/each}
	</ul>
</div>

<style>
	.hero { max-width: 48rem; margin-bottom: 2rem; }
	.eyebrow { margin: 0 0 0.45rem; color: var(--accent); font-size: 0.75rem; font-weight: 650; letter-spacing: 0.09em; text-transform: uppercase; }
	.hero h1 { margin: 0; }
	.lede { margin: 0.75rem 0 0; color: var(--text-muted); font-size: 1.0625rem; line-height: 1.65; }
	.sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.5rem; margin-bottom: 2rem; }
	.sources a { display: flex; justify-content: space-between; gap: 1rem; padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); text-decoration: none; }
	.sources a:hover, .sources a[aria-current='page'] { border-color: var(--accent); }
	.sources code { color: var(--text); font-size: 0.8125rem; }
	.sources span { color: var(--text-subtle); font-size: 0.75rem; }
	.count { color: var(--text-subtle); font-size: 0.8125rem; }

	/*
	 * The list scrolls in its own box rather than with the page.
	 *
	 * A virtualizer needs one element whose scrolling it can follow, and the page's scroller is not
	 * that element: the reading pane scrolls on wide viewports while the document scrolls on narrow
	 * ones. Owning the scroll box also keeps the filters in place while the results move, which is
	 * the behaviour this list wants anyway.
	 */
	.results { max-height: min(70vh, 46rem); overflow: hidden auto; overscroll-behavior: contain; }
	.symbols { position: relative; margin: 0; padding: 0; list-style: none; }
	.symbols li { position: absolute; top: 0; left: 0; box-sizing: border-box; width: 100%; padding: 1rem 0; border-top: 1px solid var(--border); }
</style>
