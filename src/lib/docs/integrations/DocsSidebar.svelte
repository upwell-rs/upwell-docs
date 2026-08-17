<script lang="ts">
	import { NavigationTree, TopicFilter } from '@upwell/docs-ui';

	import type { DocsVersion } from '../config.ts';
	import { activeGroupIds, filterNavigation, navigationFor, navigationTopics } from '../content/navigation.ts';
	import { presentTopics } from '../content/topics.ts';
	import { groupState, topicFilter } from '../sidebar.svelte.ts';

	interface Props {
		version: DocsVersion;
		current: string;
	}

	let { version, current }: Props = $props();

	const allNodes = $derived(navigationFor(version));
	const available = $derived(presentTopics(navigationTopics(allNodes)));
	const nodes = $derived(filterNavigation(allNodes, (topics) => topicFilter.admits(topics), current));
	const activeGroups = $derived(activeGroupIds(allNodes, current));
</script>

<nav class="sidebar" aria-label="Documentation">
	<TopicFilter
		{available}
		active={topicFilter.active}
		has={(id) => topicFilter.has(id)}
		onclear={() => topicFilter.clear()}
		ontoggle={(id) => topicFilter.toggle(id)}
	/>
	<NavigationTree
		{nodes}
		{current}
		{activeGroups}
		isOpen={(id, fallback) => groupState.isOpen(id, fallback)}
		onToggle={(id, open) => groupState.set(id, open)}
	/>
</nav>

<style>
	.sidebar {
		font-size: 0.875rem;
	}
</style>
