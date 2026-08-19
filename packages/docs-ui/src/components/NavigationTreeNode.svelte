<script lang="ts">
	import type { NavigationNode } from '../types.ts';
	import { getNavigationTreeState } from './navigation-tree-context.ts';
	import NavigationTreeNode from './NavigationTreeNode.svelte';

	interface Props {
		node: NavigationNode;
		depth: number;
	}

	let { node, depth }: Props = $props();

	const tree = getNavigationTreeState();

	const open = $derived(node.type === 'group' && (tree.activeGroups().has(node.id) || tree.isOpen(node.id, node.defaultOpen)));
</script>

<li>
	{#if node.type === 'group'}
		{#if node.children.length > 0}
			<details
				class="tree__group"
				data-group-id={node.id}
				data-reference={node.kind === 'reference' ? 'true' : undefined}
				{open}
				ontoggle={(event) => tree.onToggle(node.id, event.currentTarget.open)}
			>
				<summary class="tree__summary" class:tree__summary--current={node.pageId === tree.current()}>
					{#if node.href}
						<a href={node.href} aria-current={node.pageId === tree.current() ? 'page' : undefined}>{node.label}</a>
					{:else}
						{node.label}
					{/if}
				</summary>
				{#if open}
					<ul class="tree" data-depth={depth + 1} data-truncate={tree.truncate() ? 'true' : undefined}>
						{#each node.children as child (child.id)}
							<NavigationTreeNode node={child} depth={depth + 1} />
						{/each}
					</ul>
				{/if}
			</details>
		{:else if node.href}
			<a class="tree__link" href={node.href} title={tree.truncate() ? node.label : undefined} aria-current={node.pageId === tree.current() ? 'page' : undefined}><code>{node.label}</code></a>
		{/if}
	{:else}
		<a
			class="tree__link"
			href={node.href}
			title={tree.truncate() ? node.title : undefined}
			aria-current={node.id === tree.current() ? 'page' : undefined}
		>
			{#if node.reference}<code>{node.title}</code>{:else}{node.title}{/if}
		</a>
	{/if}
</li>

<style>
	:global(.tree[data-truncate] li) {
		min-width: 0;
	}

	:global(.tree[data-truncate] .tree__link) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.tree[data-truncate] .tree__summary) {
		min-width: 0;
	}

	:global(.tree[data-truncate] .tree__summary a) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.tree[data-depth='0'] > li + li) {
		margin-top: 1rem;
	}

	:global(.tree[data-depth='0'] > li > .tree__group[data-reference='true']) {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	:global(.tree:not([data-depth='0'])) {
		margin-left: 0.45rem;
		padding-left: 0.65rem;
		border-left: 1px solid var(--border);
	}

	:global(.tree > li:has(> .tree__group)) {
		list-style: none;
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

	:global(.tree:not([data-depth='0']) .tree__summary) {
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

	.tree__summary a {
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}

	.tree__summary--current {
		color: var(--accent);
	}

	.tree__link {
		display: block;
		margin-left: -0.625rem;
		padding: 0.25rem 0.625rem;
		border-radius: calc(var(--radius) - 2px);
		color: var(--text-muted);
		text-decoration: none;
	}

	.tree__link:hover {
		background: var(--surface-raised);
		color: var(--text);
	}

	.tree__link code {
		padding: 0;
		background: none;
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
