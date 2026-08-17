<!--
	Recursive navigation for the documented release.

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
	import { activeGroupIds, filterNavigation, navigationFor, navigationTopics } from '../content/navigation.ts';
	import { presentTopics } from '../content/topics.ts';
	import { topicFilter } from '../sidebar.svelte.ts';
	import NavigationTree from './NavigationTree.svelte';
	import TopicFilter from './TopicFilter.svelte';

	interface Props {
		version: DocsVersion;
		/** Slug of the page being read. */
		current: string;
	}

	let { version, current }: Props = $props();

	const allNodes = $derived(navigationFor(version));

	/** Only topics this release actually uses, so the filter cannot empty the sidebar. */
	const available = $derived(
		presentTopics(navigationTopics(allNodes))
	);

	const nodes = $derived(filterNavigation(allNodes, (topics) => topicFilter.admits(topics), current));
	const activeGroups = $derived(activeGroupIds(allNodes, current));
</script>

<nav class="sidebar" aria-label="Documentation">
	<TopicFilter {available} />
	<NavigationTree {nodes} {current} {activeGroups} />
</nav>

<style>
	.sidebar {
		font-size: 0.875rem;
	}

</style>
