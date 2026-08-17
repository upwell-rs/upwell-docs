<!--
	Previous and next page, in sidebar order.

	Reading order is the sidebar's order, so this is derived from it rather than declared per page.
-->
<script lang="ts">
	import type { DocsVersion, DocSummary } from '../types.ts';

	interface Props {
		version: DocsVersion;
		previous?: DocSummary;
		next?: DocSummary;
	}

	let { version, previous, next }: Props = $props();
</script>

{#if previous || next}
	<nav class="page-nav" aria-label="Pagination">
		{#if previous}
			<a class="page-nav__link" data-direction="previous" href="/docs/{version.id}/{previous.slug}">
				<span class="page-nav__label">Previous</span>
				<span class="page-nav__title">{previous.title}</span>
			</a>
		{:else}
			<span></span>
		{/if}

		{#if next}
			<a class="page-nav__link" data-direction="next" href="/docs/{version.id}/{next.slug}">
				<span class="page-nav__label">Next</span>
				<span class="page-nav__title">{next.title}</span>
			</a>
		{/if}
	</nav>
{/if}

<style>
	.page-nav {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-top: 3rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
	}

	.page-nav__link {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-decoration: none;
	}

	.page-nav__link[data-direction='next'] {
		text-align: right;
	}

	.page-nav__link:hover {
		border-color: var(--accent);
	}

	.page-nav__label {
		color: var(--text-subtle);
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.page-nav__title {
		color: var(--text);
		font-weight: 500;
	}
</style>
