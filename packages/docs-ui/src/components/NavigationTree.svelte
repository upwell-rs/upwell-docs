<script lang="ts">
	import type { NavigationNode } from '../types.ts';
	import NavigationTree from './NavigationTree.svelte';

	interface Props {
		nodes: readonly NavigationNode[];
		current: string;
		activeGroups: ReadonlySet<string>;
		depth?: number;
		isOpen: (id: string, fallback: boolean) => boolean;
		onToggle: (id: string, open: boolean) => void;
	}

	let { nodes, current, activeGroups, depth = 0, isOpen, onToggle }: Props = $props();
</script>

<ul class="tree" data-depth={depth}>
	{#each nodes as node (node.id)}
		<li>
			{#if node.type === 'group'}
				{#if node.children.length > 0}
					<details
						class="tree__group"
						data-group-id={node.id}
						data-reference={node.kind === 'reference' ? 'true' : undefined}
						open={activeGroups.has(node.id) || isOpen(node.id, node.defaultOpen)}
						ontoggle={(event) => onToggle(node.id, event.currentTarget.open)}
					>
						<summary class="tree__summary" class:tree__summary--current={node.pageId === current}>
							{#if node.href}
								<a href={node.href} aria-current={node.pageId === current ? 'page' : undefined} onclick={(event) => event.stopPropagation()}>{node.label}</a>
							{:else}
								{node.label}
							{/if}
						</summary>
						<NavigationTree nodes={node.children} {current} {activeGroups} {isOpen} {onToggle} depth={depth + 1} />
					</details>
				{:else if node.href}
					<a class="tree__link" href={node.href} aria-current={node.pageId === current ? 'page' : undefined}><code>{node.label}</code></a>
				{/if}
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
