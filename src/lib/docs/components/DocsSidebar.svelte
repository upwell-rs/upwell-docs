<!--
	Section navigation for the documented release.

	Built from page frontmatter rather than a hand-maintained list, so adding a page adds it to the
	sidebar and nothing can drift out of sync.

	Groups collapse. `<details>` does the work rather than a store and a click handler: it is
	keyboard accessible for free, it survives having JavaScript disabled, and — the reason it matters
	here — the browser's own in-page find opens a closed `<details>` to reveal a match, which a
	`hidden` list would not.

	The API group is reference material rather than part of the reading order. It is set off by a rule
	and collapsed by default, which is enough to place it — and is also why the previous/next
	shortcuts do nothing on a symbol page.
-->
<script lang="ts">
	import type { DocsVersion } from '../config.ts';
	import { sections } from '../content/pages.ts';
	import { symbolPagesFor } from '../content/symbol-pages.ts';
	import { presentTopics } from '../content/topics.ts';
	import { groupState, topicFilter } from '../sidebar.svelte.ts';
	import TopicFilter from './TopicFilter.svelte';

	interface Props {
		version: DocsVersion;
		/** Slug of the page being read. */
		current: string;
	}

	let { version, current }: Props = $props();

	const allGroups = $derived(sections(version.frameworkVersion));

	// Symbol pages are reference material, mostly reached from a code block. Listing them anyway is
	// what makes it possible to find one without first finding a snippet that mentions it.
	const allSymbols = $derived(symbolPagesFor(version.frameworkVersion).filter((page) => !page.draft));

	/** Only topics this release actually uses, so the filter cannot empty the sidebar. */
	const available = $derived(
		presentTopics([
			...allGroups.flatMap((group) => group.pages.flatMap((page) => page.topics)),
			...allSymbols.flatMap((page) => page.topics)
		])
	);

	// A group that the filter empties is dropped entirely rather than left as a bare heading.
	const groups = $derived(
		allGroups
			.map((group) => ({ ...group, pages: group.pages.filter((page) => topicFilter.admits(page.topics)) }))
			.filter((group) => group.pages.length > 0)
	);

	const symbols = $derived(allSymbols.filter((page) => topicFilter.admits(page.topics)));

	/** A group holding the current page always opens, whatever the reader collapsed last time. */
	function isOpen(title: string, holdsCurrent: boolean, fallback = true): boolean {
		return holdsCurrent || groupState.isOpen(title, fallback);
	}
</script>

<nav class="sidebar" aria-label="Documentation">
	<TopicFilter {available} />

	{#each groups as group (group.title)}
		{@const holdsCurrent = group.pages.some((page) => page.slug === current)}
		<details
			class="sidebar__group"
			open={isOpen(group.title, holdsCurrent)}
			ontoggle={(event) => groupState.set(group.title, !event.currentTarget.open)}
		>
			<summary class="sidebar__title">{group.title}</summary>
			<ul class="sidebar__list">
				{#each group.pages as page (page.slug)}
					<li>
						<a
							class="sidebar__link"
							href="/docs/{version.id}/{page.slug}"
							aria-current={page.slug === current ? 'page' : undefined}
						>{page.title}</a>
					</li>
				{/each}
			</ul>
		</details>
	{/each}

	{#if symbols.length > 0}
		{@const holdsCurrent = symbols.some((page) => `symbols/${page.segments}` === current)}
		<details
			class="sidebar__group"
			data-reference="true"
			open={isOpen('API', holdsCurrent, false)}
			ontoggle={(event) => groupState.set('API', !event.currentTarget.open)}
		>
			<summary class="sidebar__title">
				API reference
			</summary>
			<ul class="sidebar__list">
				{#each symbols as page (page.symbol)}
					<li>
						<a
							class="sidebar__link"
							href="/docs/{version.id}/symbols/{page.segments}"
							aria-current={`symbols/${page.segments}` === current ? 'page' : undefined}
						><code>{page.title}</code></a>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</nav>

<style>
	.sidebar {
		font-size: 0.875rem;
	}

	.sidebar__group + .sidebar__group {
		margin-top: 1rem;
	}

	.sidebar__title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0 0 0.5rem;
		padding: 0.15rem 0;
		color: var(--text-subtle);
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		list-style: none;
		text-transform: uppercase;
		user-select: none;
	}

	/* The default triangle sits awkwardly against uppercase text; a rotating chevron replaces it. */
	.sidebar__title::-webkit-details-marker {
		display: none;
	}

	.sidebar__title::before {
		content: '';
		width: 0.4rem;
		height: 0.4rem;
		border-right: 1.5px solid currentColor;
		border-bottom: 1.5px solid currentColor;
		transform: rotate(-45deg);
		transition: transform 150ms ease;
	}

	.sidebar__group[open] > .sidebar__title::before {
		transform: rotate(45deg);
	}

	.sidebar__title:hover {
		color: var(--text);
	}

	/* Reference material reads as a sidebar of its own, not another chapter. */
	.sidebar__group[data-reference='true'] {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.sidebar__list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.sidebar__link {
		display: block;
		padding: 0.25rem 0.625rem;
		margin-left: -0.625rem;
		border-radius: calc(var(--radius) - 2px);
		color: var(--text-muted);
		text-decoration: none;
	}

	.sidebar__link:hover {
		background: var(--surface-raised);
		color: var(--text);
	}

	.sidebar__link code {
		background: none;
		padding: 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}

	.sidebar__link[aria-current='page'] {
		background: var(--accent-surface);
		color: var(--accent);
		font-weight: 500;
	}

	@media (prefers-reduced-motion: reduce) {
		.sidebar__title::before {
			transition: none;
		}
	}
</style>
