<script lang="ts">
	import { NavigationTree, TopicFilter } from '@upwell/docs-ui';
	import { activeGroupIds, filterNavigation, navigationTopics } from '@upwell/docs-core/navigation';
	import type { DocsVersion } from '@upwell/docs-core/config';

	import type { DocsContent } from '../content.ts';
	import type { SidebarState } from '../client.svelte.ts';

	interface Props {
		content: DocsContent;
		version: DocsVersion;
		current: string;
		state: SidebarState;
	}

	let { content, version, current, state }: Props = $props();

	const allNodes = $derived(content.navigationFor(version));
	const available = $derived(content.topics.present(navigationTopics(allNodes)));
	const nodes = $derived(filterNavigation(allNodes, (topics) => state.topics.admits(topics), current));
	const activeGroups = $derived(activeGroupIds(allNodes, current));
</script>

<nav class="sidebar" aria-label="Documentation">
	<TopicFilter
		{available}
		active={state.topics.active}
		has={(id) => state.topics.has(id)}
		onclear={() => state.topics.clear()}
		ontoggle={(id) => state.topics.toggle(id)}
	/>
	<NavigationTree
		{nodes}
		{current}
		{activeGroups}
		isOpen={(id, fallback) => state.groups.isOpen(id, fallback)}
		onToggle={(id, open) => state.groups.set(id, open)}
	/>
</nav>

<style>
	.sidebar {
		font-size: 0.875rem;
	}
</style>
