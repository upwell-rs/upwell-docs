<script lang="ts">
	import type { SourceFileEntry } from '../../server/source.ts';
	import { directSourceChildren } from './model.ts';
	import SourceMarkdown from './SourceMarkdown.svelte';

	interface Props {
		files: readonly SourceFileEntry[];
		path: string;
		baseHref: string;
		markdownHtml: string;
		markdownPath: string | null;
	}

	let { files, path, baseHref, markdownHtml, markdownPath }: Props = $props();
	const entries = $derived(directSourceChildren(files, path));
</script>

<div class="directory">
	{#each entries as entry (entry.path)}
		<a href={`${baseHref}${entry.path}`}>
			<span class:folder={entry.kind === 'directory'} aria-hidden="true"></span>
			<strong>{entry.name}</strong>
			<small>{entry.kind}</small>
		</a>
	{/each}

	{#if markdownHtml && markdownPath}
		<section class="readme">
			<header><span>README preview</span><a href={`${baseHref}${markdownPath}`}>Open file</a></header>
			<SourceMarkdown html={markdownHtml} label={`Preview of ${markdownPath}`} />
		</section>
	{/if}
</div>

<style>
	.directory { min-height: 0; overflow: auto; padding: 0.75rem; background: var(--surface-sunken); }
	a { display: grid; grid-template-columns: 1.25rem minmax(0, 1fr) auto; align-items: center; gap: 0.5rem; padding: 0.55rem 0.7rem; border-bottom: 1px solid var(--border); color: var(--text); text-decoration: none; }
	a:hover { background: var(--surface-raised); }
	a > span { width: 0.72rem; height: 0.85rem; border: 1px solid var(--text-subtle); border-radius: 1px; }
	a > span.folder { height: 0.62rem; border: 0; border-radius: 2px; background: color-mix(in srgb, var(--lens-module) 65%, var(--surface)); box-shadow: 0 -0.18rem 0 -0.04rem color-mix(in srgb, var(--lens-module) 65%, var(--surface)); }
	small { color: var(--text-subtle); text-transform: capitalize; }
	.readme { margin-top: 1.25rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
	.readme > header { display: flex; justify-content: space-between; padding: 0.65rem 0.85rem; border-bottom: 1px solid var(--border); color: var(--text-subtle); font-size: 0.75rem; text-transform: uppercase; }
	.readme > header a { display: inline; padding: 0; border: 0; color: var(--accent); text-transform: none; }
</style>
