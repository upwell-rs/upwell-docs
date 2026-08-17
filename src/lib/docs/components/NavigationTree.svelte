<script lang="ts">
	import type { NavigationNode } from '../content/types.ts';
	import { groupState } from '../sidebar.svelte.ts';
	import NavigationTree from './NavigationTree.svelte';

	interface Props {
		nodes: readonly NavigationNode[];
		current: string;
		activeGroups: ReadonlySet<string>;
		depth?: number;
	}

	let { nodes, current, activeGroups, depth = 0 }: Props = $props();
</script>

<ul class="tree" data-depth={depth}>
	{#each nodes as node (node.id)}
		<li>
			{#if node.type === 'group'}
				<details
					class="tree__group"
					data-group-id={node.id}
					data-reference={node.kind === 'reference' ? 'true' : undefined}
					open={activeGroups.has(node.id) || groupState.isOpen(node.id, node.defaultOpen)}
					ontoggle={(event) => groupState.set(node.id, !event.currentTarget.open)}
				>
					<summary class="tree__summary">{node.label}</summary>
					<NavigationTree nodes={node.children} {current} {activeGroups} depth={depth + 1} />
				</details>
			{:else}
				<a
					class="tree__link"
					href={node.href}
					aria-current={node.id === current ? 'page' : undefined}
				>
					{#if node.reference}<code>{node.title}</code>{:else}{node.title}{/if}
				</a>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.tree {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tree[data-depth='0'] > li + li {
		margin-top: 1rem;
	}

	.tree[data-depth='0'] > li > .tree__group[data-reference='true'] {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.tree:not([data-depth='0']) {
		margin-left: 0.45rem;
		padding-left: 0.65rem;
		border-left: 1px solid var(--border);
	}

	.tree__summary {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 0;
		color: var(--text-subtle);
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.045em;
		list-style: none;
		text-transform: uppercase;
		user-select: none;
	}

	.tree:not([data-depth='0']) .tree__summary {
		letter-spacing: 0.015em;
		text-transform: none;
	}

	.tree__summary::-webkit-details-marker {
		display: none;
	}

	.tree__summary::before {
		content: '';
		width: 0.35rem;
		height: 0.35rem;
		border-right: 1.5px solid currentColor;
		border-bottom: 1.5px solid currentColor;
		transform: rotate(-45deg);
		transition: transform 150ms ease;
	}

	.tree__group[open] > .tree__summary::before {
		transform: rotate(45deg);
	}

	.tree__summary:hover {
		color: var(--text);
	}

	.tree__link {
		display: block;
		padding: 0.25rem 0.625rem;
		margin-left: -0.625rem;
		border-radius: calc(var(--radius) - 2px);
		color: var(--text-muted);
		text-decoration: none;
	}

	.tree__link:hover {
		background: var(--surface-raised);
		color: var(--text);
	}

	.tree__link code {
		background: none;
		padding: 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}

	.tree__link[aria-current='page'] {
		background: var(--accent-surface);
		color: var(--accent);
		font-weight: 500;
	}

	@media (prefers-reduced-motion: reduce) {
		.tree__summary::before {
			transition: none;
		}
	}
</style>
