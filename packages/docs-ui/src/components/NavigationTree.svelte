<script lang="ts">
	import type { NavigationNode } from '../types.ts';
	import { revealWithin } from '../reveal.ts';
	import { setNavigationTreeState } from './navigation-tree-context.ts';
	import NavigationTreeNode from './NavigationTreeNode.svelte';

	interface Props {
		nodes: readonly NavigationNode[];
		current: string;
		activeGroups: ReadonlySet<string>;
		/** Clips labels to one line instead of wrapping them. */
		truncate?: boolean;
		isOpen: (id: string, fallback: boolean) => boolean;
		onToggle: (id: string, open: boolean) => void;
	}

	let { nodes, current, activeGroups, truncate = false, isOpen, onToggle }: Props = $props();

	setNavigationTreeState({
		current: () => current,
		activeGroups: () => activeGroups,
		truncate: () => truncate,
		isOpen: (id, fallback) => isOpen(id, fallback),
		onToggle: (id, open) => onToggle(id, open)
	});

	/** Keeps the current entry in view without scrolling the reading pane or nested tree lists. */
	function revealCurrent(root: HTMLUListElement): void {
		void current;

		revealWithin(root.querySelector<HTMLElement>('[aria-current="page"]') ?? undefined, root);
	}
</script>

<ul {@attach revealCurrent} class="tree" data-depth="0" data-truncate={truncate ? 'true' : undefined}>
	{#each nodes as node (node.id)}
		<NavigationTreeNode {node} depth={0} />
	{/each}
</ul>

<style>
	.tree {
		min-width: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
