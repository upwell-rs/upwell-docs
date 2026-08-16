<!--
	Narrows the sidebar to a subject.

	Only topics actually used by the pages of this release are offered, so the filter never shows a
	choice that would empty the sidebar.

	The active state is deliberately loud — a count and a visible reset — because the filter persists
	across visits. A reader who narrowed to HTTP last week and forgot would otherwise conclude the
	documentation had lost half its pages.
-->
<script lang="ts">
	import type { Topic } from '../content/topics.ts';
	import { topicFilter } from '../sidebar.svelte.ts';

	interface Props {
		/** Topics present among the pages of the release being read. */
		available: readonly Topic[];
	}

	let { available }: Props = $props();
</script>

{#if available.length > 1}
	<section class="topics" aria-label="Filter by topic">
		<div class="topics__header">
			<h2 class="topics__title">Topics</h2>
			{#if topicFilter.active}
				<button class="topics__reset" type="button" onclick={() => topicFilter.clear()}>
					Clear
				</button>
			{/if}
		</div>

		<ul class="topics__list">
			{#each available as topic (topic.id)}
				<li>
					<button
						class="topics__chip"
						type="button"
						aria-pressed={topicFilter.has(topic.id)}
						title={topic.description}
						onclick={() => topicFilter.toggle(topic.id)}
					>{topic.label}</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.topics {
		margin-bottom: 1.25rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border);
	}

	.topics__header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.topics__title {
		margin: 0;
		color: var(--text-subtle);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.topics__reset {
		padding: 0;
		border: none;
		background: none;
		color: var(--accent);
		cursor: pointer;
		font: inherit;
		font-size: 0.75rem;
	}

	.topics__list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.topics__chip {
		padding: 0.15rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface-raised);
		color: var(--text-muted);
		cursor: pointer;
		font: inherit;
		font-size: 0.75rem;
		line-height: 1.5;
	}

	.topics__chip:hover {
		color: var(--text);
	}

	.topics__chip[aria-pressed='true'] {
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
		background: var(--accent-surface);
		color: var(--accent);
		font-weight: 500;
	}
</style>
