<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { SourceFileEntry } from '../../server/source.ts';
	import { encodeSourcePath, isViewableSource, sourceTreeRows } from './model.ts';

	interface Props {
		files: readonly SourceFileEntry[];
		current: string;
		revision: string;
		baseHref: string;
		apiBase: string;
		mobileOpen?: boolean;
		onclose?: () => void;
	}

	let { files, current, revision, baseHref, apiBase, mobileOpen = false, onclose }: Props = $props();
	let filter = $state('');
	let intentTimer: ReturnType<typeof setTimeout> | undefined;
	let intentController: AbortController | undefined;
	let lastPointer = { x: 0, y: 0, at: 0 };
	const prefetched = new SvelteSet<string>();
	const openDirectories = new SvelteSet<string>();
	const paths = $derived(files.map((entry) => entry.path).filter(isViewableSource));
	const rows = $derived(sourceTreeRows(paths, current, filter, openDirectories));

	$effect(() => {
		const parts = current.split('/').filter(Boolean);

		for (let index = 1; index < parts.length; index += 1) openDirectories.add(parts.slice(0, index).join('/'));
	});

	function toggle(path: string): void {
		if (openDirectories.has(path)) openDirectories.delete(path);
		else openDirectories.add(path);
	}

	function predict(event: PointerEvent, path: string): void {
		if (event.pointerType !== 'mouse' || path === current || prefetched.has(path)) return;
		const now = performance.now();
		const elapsed = Math.max(now - lastPointer.at, 1);
		const velocity = Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y) / elapsed;
		lastPointer = { x: event.clientX, y: event.clientY, at: now };
		clearTimeout(intentTimer);

		if (velocity <= 0.55) intentTimer = setTimeout(() => prefetch(path), 120);
	}

	function prefetch(path: string): void {
		if (prefetched.has(path)) return;
		intentController?.abort();
		intentController = new AbortController();
		prefetched.add(path);
		void fetch(`${apiBase}/src/${encodeSourcePath(path)}`, { signal: intentController.signal }).catch(() => prefetched.delete(path));
	}
</script>

<aside class:tree--open={mobileOpen} class="tree" aria-label="Repository files">
	<div class="tree__heading"><strong>Files</strong><code>{revision.slice(0, 8)}</code>{#if onclose}<button class="tree__close" type="button" onclick={onclose}>Close</button>{/if}</div>
	<input bind:value={filter} type="search" placeholder="Filter files" aria-label="Filter repository files" />
	<nav>
		{#each rows as entry (entry.path)}
			<div class="row" style={`--depth: ${entry.depth}`}>
				{#if entry.kind === 'directory'}
					<button type="button" aria-label={`${openDirectories.has(entry.path) ? 'Collapse' : 'Expand'} ${entry.name}`} onclick={() => toggle(entry.path)}>{openDirectories.has(entry.path) || current.startsWith(`${entry.path}/`) ? '▾' : '▸'}</button>
				{:else}<span class="spacer"></span>{/if}
				<a
					href={`${baseHref}${entry.path}`}
					aria-current={entry.path === current ? 'page' : undefined}
					onpointermove={(event) => entry.kind === 'file' && predict(event, entry.path)}
					onfocus={() => entry.kind === 'file' && prefetch(entry.path)}
				><span class:folder={entry.kind === 'directory'} aria-hidden="true"></span>{entry.name}</a>
			</div>
		{/each}
	</nav>
</aside>

<style>
	.tree { display: none; grid-template-rows: auto auto minmax(0, 1fr); min-width: 0; min-height: 0; height: 100%; overflow: hidden; border-right: 1px solid var(--border); background: var(--surface-raised); }
	.tree--open { position: absolute; z-index: 20; inset: 0 auto 0 0; display: grid; width: min(20rem, 88vw); box-shadow: 12px 0 32px color-mix(in srgb, var(--shadow) 45%, transparent); }
	.tree__heading { display: flex; align-items: center; justify-content: space-between; min-height: 3rem; padding: 0.65rem 0.85rem; border-bottom: 1px solid var(--border); }
	.tree__heading code { color: var(--text-subtle); font-size: 0.7rem; letter-spacing: 0.05em; text-transform: uppercase; }
	.tree__close { margin-left: auto; border: 0; background: none; color: var(--accent); cursor: pointer; }
	input { width: calc(100% - 1.25rem); margin: 0.625rem; padding: 0.45rem 0.55rem; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); background: var(--surface); color: var(--text); }
	nav { min-height: 0; overflow: auto; padding: 0 0.35rem 0.75rem; }
	.row { display: flex; align-items: center; min-width: 0; padding-left: calc(var(--depth) * 0.8rem); }
	.row button, .spacer { flex: 0 0 1.25rem; width: 1.25rem; height: 1.65rem; padding: 0; border: 0; background: none; color: var(--text-subtle); cursor: pointer; }
	.row a { display: flex; flex: 1; min-width: 0; align-items: center; gap: 0.35rem; overflow: hidden; padding: 0.27rem 0.4rem; border-radius: 4px; color: var(--text-muted); font-family: var(--font-mono); font-size: 0.74rem; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
	.row a > span { flex: 0 0 0.72rem; width: 0.72rem; height: 0.85rem; border: 1px solid color-mix(in srgb, currentColor 45%, transparent); border-radius: 1px; color: var(--text-subtle); }
	.row a > span.folder { height: 0.62rem; border: 0; border-radius: 2px; background: color-mix(in srgb, var(--lens-module) 65%, var(--surface)); box-shadow: 0 -0.18rem 0 -0.04rem color-mix(in srgb, var(--lens-module) 65%, var(--surface)); }
	.row a:hover, .row a[aria-current='page'] { background: var(--surface-sunken); color: var(--text); }
	@media (min-width: 60rem) { .tree { position: static; display: grid; width: auto; box-shadow: none; } .tree__close { display: none; } }
</style>
