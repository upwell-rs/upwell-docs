<script lang="ts">
	import type { SearchResult } from '../../search/rank.ts';
	import Highlight from '../Highlight.svelte';

	interface Props {
		result: SearchResult;
		id: string;
		selected: boolean;
		onactive: () => void;
		onselect: () => void;
	}

	let { result, id, selected, onactive, onselect }: Props = $props();

	const KIND_LABEL: Record<string, string> = {
		guide: 'Guide',
		'symbol-page': 'Reference',
		symbol: 'Symbol'
	};
</script>

<li role="presentation">
	<a
		class="search__result"
		{id}
		href={result.href}
		rel={result.record.external ? 'noreferrer' : undefined}
		role="option"
		tabindex="-1"
		aria-selected={selected}
		onmouseenter={onactive}
		onclick={onselect}
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

<style>
	/* On narrow screens the kind moves above the title instead of consuming a fixed column. */
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

	.search__result[aria-selected='true'] {
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
