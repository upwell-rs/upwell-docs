<script lang="ts">
	import type { SymbolInfo } from '@upwell/docs-ui/types';
	import { getDocsNotifier } from '@upwell/docs-ui/context';
	import type { SourceFile } from '../server/source.ts';
	import SourceBreadcrumbs from './source-viewer/SourceBreadcrumbs.svelte';
	import SourceCode from './source-viewer/SourceCode.svelte';
	import SourceDirectory from './source-viewer/SourceDirectory.svelte';
	import SourceMarkdown from './source-viewer/SourceMarkdown.svelte';
	import SourceTree from './source-viewer/SourceTree.svelte';

	interface Props {
		source: string;
		version: string;
		file: SourceFile;
	}

	let { source, version, file }: Props = $props();
	let inspector = $state<SymbolInfo>();
	let inspectorLoading = $state(false);

	/**
	 * The inspection in flight, if any.
	 *
	 * An answer is only about the symbol that was asked for. Two clicks in a row, or a click followed
	 * by opening another file, otherwise race: whichever response is slower wins and the panel ends up
	 * describing a symbol the reader is no longer looking at.
	 */
	let inspection: AbortController | undefined;
	let showMarkdown = $state(true);
	let treeOpen = $state(false);
	let previousPath: string | undefined;
	const notifier = getDocsNotifier();
	const sourceBase = $derived(`/docs/${source}/${version}/src/`);
	const apiBase = $derived(`/api/docs/${source}/${version}`);

	$effect(() => {
		const path = file.path;

		if (previousPath === undefined) {
			previousPath = path;

			return;
		}

		if (path === previousPath) {
			return;
		}

		previousPath = path;

		inspection?.abort();
		inspection = undefined;
		showMarkdown = true;
		inspector = undefined;
		inspectorLoading = false;
		treeOpen = false;
	});

	async function inspect(path: string): Promise<void> {
		inspection?.abort();

		const request = new AbortController();

		inspection = request;
		inspectorLoading = true;

		try {
			const response = await fetch(`${apiBase}/symbol?path=${encodeURIComponent(path)}`, { signal: request.signal });

			if (!response.ok) {
				throw new Error(`Request failed with ${response.status}.`);
			}

			inspector = await response.json() as SymbolInfo;
		} catch (cause) {
			// A superseded request is not a failure: the reader asked for something else, and that
			// request owns the panel now.
			if (request.signal.aborted) {
				return;
			}

			inspector = undefined;
			notifier?.failed('Could not load symbol documentation', cause instanceof Error ? cause.message : undefined);
		} finally {
			if (inspection === request) {
				inspection = undefined;
				inspectorLoading = false;
			}
		}
	}
</script>

<div class="viewer">
	<SourceTree files={file.files} current={file.path} revision={file.revision} baseHref={sourceBase} {apiBase} mobileOpen={treeOpen} onclose={() => { treeOpen = false; }} />

	<section class="source">
		<header>
			<button class="files" type="button" onclick={() => { treeOpen = true; }}>Files</button>
			<SourceBreadcrumbs {source} path={file.path} baseHref={sourceBase} />
			<div class="actions">
				{#if file.kind === 'file' && file.markdownHtml}<button type="button" onclick={() => { showMarkdown = !showMarkdown; }}>{showMarkdown ? 'View source' : 'Preview'}</button>{/if}
				<a href={file.githubHref} rel="noreferrer">View on GitHub</a>
			</div>
		</header>

		{#key file.path}
			{#if file.kind === 'directory'}
				<SourceDirectory files={file.files} path={file.path} baseHref={sourceBase} markdownHtml={file.markdownHtml} markdownPath={file.markdownPath} />
			{:else if showMarkdown && file.markdownHtml}
				<div class="markdown-scroll"><SourceMarkdown html={file.markdownHtml} label={`Preview of ${file.path}`} /></div>
			{:else}
				<SourceCode html={file.sourceHtml} oninspect={inspect} />
			{/if}
		{/key}
	</section>

	{#if inspectorLoading || inspector}
		<aside class="inspector" aria-label="Symbol documentation">
			<button type="button" onclick={() => { inspector = undefined; }}>Close</button>
			{#if inspectorLoading}
				<p>Loading documentation...</p>
			{:else if inspector}
				<p class="kind">{inspector.kind.replace('_', ' ')}</p>
				<h2>{inspector.name}</h2>
				<code>{inspector.canonicalPath}</code>
				{#if inspector.signature}<pre>{inspector.signature}</pre>{/if}
				{#if inspector.doc}<p>{inspector.doc}</p>{/if}
			{/if}
		</aside>
	{/if}
</div>

<style>
	.viewer { position: relative; box-sizing: border-box; display: grid; height: 100%; min-height: 0; overflow: hidden; background: var(--surface); }
	.source { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
	header { box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 3rem; padding: 0.65rem 0.85rem; border-bottom: 1px solid var(--border); }
	.actions { display: flex; align-items: center; gap: 0.75rem; }
	.files { border: 1px solid var(--border); border-radius: 4px; background: var(--surface-raised); color: var(--text); font: inherit; font-size: 0.75rem; cursor: pointer; }
	.actions a, .actions button { border: 0; background: none; color: var(--accent); cursor: pointer; font: inherit; font-size: 0.78rem; text-decoration: none; white-space: nowrap; }
	.markdown-scroll { min-height: 0; overflow: auto; background: var(--surface-sunken); }
	.inspector { height: 100%; overflow: auto; padding: 1rem; border-left: 1px solid var(--border); background: var(--surface-raised); }
	.inspector button { float: right; border: 0; background: none; color: var(--text-muted); cursor: pointer; }
	.inspector h2 { margin: 0.3rem 0; font-size: 1.1rem; }
	.inspector > code { color: var(--text-muted); font-size: 0.75rem; }
	.inspector pre { overflow: auto; margin: 1rem 0; padding: 0.7rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-sunken); white-space: pre-wrap; }
	.inspector p { color: var(--text-muted); font-size: 0.85rem; line-height: 1.6; }
	.kind { color: var(--text-subtle); font-size: 0.7rem; letter-spacing: 0.05em; text-transform: uppercase; }
	@media (min-width: 60rem) { .viewer { grid-template-columns: 17rem minmax(0, 1fr); } .files { display: none; } }
	@media (min-width: 82rem) { .viewer:has(.inspector) { grid-template-columns: 17rem minmax(0, 1fr) 20rem; } }
</style>
