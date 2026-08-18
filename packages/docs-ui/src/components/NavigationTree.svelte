<script lang="ts">
	import type { NavigationNode } from '../types.ts';
	import { revealWithin } from '../reveal.ts';
	import NavigationTree from './NavigationTree.svelte';

	interface Props {
		nodes: readonly NavigationNode[];
		current: string;
		activeGroups: ReadonlySet<string>;
		depth?: number;
		/**
		 * Clips labels to one line instead of wrapping them.
		 *
		 * For the reference tree, whose labels are Rust identifiers: a wrapped identifier is harder to
		 * scan than a clipped one, and identifiers are long enough that wrapping every entry turns the
		 * tree into a wall. Guide titles are prose and wrap, which is why this is not the default.
		 */
		truncate?: boolean;
		isOpen: (id: string, fallback: boolean) => boolean;
		onToggle: (id: string, open: boolean) => void;
	}

	let { nodes, current, activeGroups, depth = 0, truncate = false, isOpen, onToggle }: Props = $props();

	let root = $state<HTMLUListElement>();

	/**
	 * Keeps the current entry in view whenever it changes.
	 *
	 * The reader can reach a page without touching the tree — the previous and next shortcuts, search,
	 * an in-page link — and then the entry marking where they are is wherever the tree was last left,
	 * often outside the scroll box entirely. Only the outermost tree does this: the nested instances
	 * render the same `current` and would each scroll for the one entry that owns it.
	 */
	$effect(() => {
		void current;

		if (depth === 0) {
			revealWithin(root?.querySelector<HTMLElement>('[aria-current="page"]') ?? undefined, root);
		}
	});
</script>

<ul bind:this={root} class="tree" data-depth={depth} data-truncate={truncate ? 'true' : undefined}>
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
								<!--
									The click must reach the router, so this link stops nothing.

									A `stopPropagation` here looks harmless — the group is a disclosure and the link sits in
									its summary — but the router listens for clicks on the document, so swallowing the event
									turns every group entrypoint into a full page load. The summary does not toggle anyway:
									the innermost activatable element in the path is the activation target, and that is the
									link.
								-->
								<a href={node.href} aria-current={node.pageId === current ? 'page' : undefined}>{node.label}</a>
							{:else}
								{node.label}
							{/if}
						</summary>
						<NavigationTree nodes={node.children} {current} {activeGroups} {truncate} {isOpen} {onToggle} depth={depth + 1} />
					</details>
				{:else if node.href}
					<a class="tree__link" href={node.href} title={truncate ? node.label : undefined} aria-current={node.pageId === current ? 'page' : undefined}><code>{node.label}</code></a>
				{/if}
			{:else}
				<a
					class="tree__link"
					href={node.href}
					title={truncate ? node.title : undefined}
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
		min-width: 0;
		list-style: none;
	}

	/*
	 * Clipping needs the whole chain, not just the link: a `min-width: 0` on every box between the
	 * sidebar and the text, or the intrinsic width of a long identifier wins and the tree scrolls
	 * sideways instead of ellipsing.
	 */
	.tree[data-truncate] li {
		min-width: 0;
	}

	.tree[data-truncate] .tree__link {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tree[data-truncate] .tree__summary {
		min-width: 0;
	}

	.tree[data-truncate] .tree__summary a {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
