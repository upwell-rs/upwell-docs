<script lang="ts">
	import { onMount } from 'svelte';
	import { NavigationTree } from '@upwell/docs-ui';
	import { activeGroupIds, buildSymbolTree } from '@upwell/docs-core/navigation';

	import type { SidebarState } from '../client.svelte.ts';
	import type { SymbolRecord } from '../sveltekit-server.ts';

	interface Props {
		records: readonly SymbolRecord[];
		current: string;
		indexHref: string;
		state: SidebarState;
	}

	let { records, current, indexHref, state: sidebarState }: Props = $props();
	let loaded = $state<readonly SymbolRecord[]>([]);

	const availableRecords = $derived(records.length > 0 ? records : loaded);
	const nodes = $derived(buildSymbolTree(availableRecords));
	const activeGroups = $derived(activeGroupIds(nodes, current));

	onMount(async () => {
		if (records.length > 0) {
			return;
		}

		loaded = await loadRecords(indexHref.replace(/\/symbols$/, '/symbols.json'));
	});
</script>

<nav class="sidebar" aria-label="Symbols">
	<div class="sidebar__heading">
		<span>Reference</span>
		<a href={indexHref} aria-current={current === 'symbols' ? 'page' : undefined}>All symbols</a>
	</div>
	<NavigationTree
		{nodes}
		{current}
		{activeGroups}
		truncate
		isOpen={(id, fallback) => sidebarState.groups.isOpen(id, fallback)}
		onToggle={(id, open) => sidebarState.groups.set(id, open)}
	/>
</nav>

<style>
	.sidebar {
		min-width: 0;
		font-size: 0.875rem;
	}

	.sidebar__heading {
		display: grid;
		gap: 0.35rem;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border);
	}

	.sidebar__heading span {
		color: var(--text-subtle);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.sidebar__heading a {
		padding: 0.35rem 0.5rem;
		border-radius: calc(var(--radius) - 2px);
		color: var(--text-muted);
		text-decoration: none;
	}

	.sidebar__heading a:hover,
	.sidebar__heading a[aria-current='page'] {
		background: var(--accent-surface);
		color: var(--accent);
	}
</style>

<script lang="ts" module>
	const cache: Record<string, Promise<readonly SymbolRecord[]> | undefined> = {};

	function loadRecords(href: string): Promise<readonly SymbolRecord[]> {
		const existing = cache[href];

		if (existing) {
			return existing;
		}

		const loading = fetch(href).then((response) => {
			if (!response.ok) {
				throw new Error(`Could not load symbol navigation: ${response.status}`);
			}

			return response.json() as Promise<readonly SymbolRecord[]>;
		});

		cache[href] = loading;

		return loading;
	}
</script>
