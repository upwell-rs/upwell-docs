<script lang="ts">
	import type { Component } from 'svelte';
	import { setSymbolInfo } from '@upwell/docs-ui/context';
	import type { DocsVersion } from '@upwell/docs-core/config';
	import type { SymbolPageSummary } from '@upwell/docs-core/content';
	import type { SymbolInfo } from '@upwell/docs-ui/types';
	import { SymbolImpls, SymbolMembers, SymbolMeta, SymbolSignature } from '@upwell/docs-ui';

	interface Props {
		version: DocsVersion;
		page: SymbolPageSummary;
		symbol: SymbolInfo;
		component: Component | undefined;
		kind: 'authored' | 'generated';
		docsHtml: string;
	}

	let { version, page, symbol, component: Content, kind, docsHtml }: Props = $props();

	setSymbolInfo(() => symbol);
</script>

<svelte:head>
	<title>{page.title} · {version.label}</title>
	{#if page.description ?? symbol.doc}
		<meta name="description" content={page.description ?? symbol.doc} />
	{/if}
</svelte:head>

{#if Content}
	<Content />
{:else if kind === 'generated'}
	<h1>{page.title}</h1>
	<SymbolMeta />
	<SymbolSignature />
	{#if docsHtml}
		<!-- Server-rendered by the restrictive Rustdoc Markdown sanitizer. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<div class="rustdoc prose">{@html docsHtml}</div>
	{/if}
	<SymbolMembers />
	<SymbolImpls />
{/if}

<style>
	.rustdoc {
		margin: 1.5rem 0 2rem;
		color: var(--text-muted);
		line-height: 1.7;
	}

	.rustdoc :global(h1),
	.rustdoc :global(h2),
	.rustdoc :global(h3),
	.rustdoc :global(h4) {
		margin: 1.75em 0 0.55em;
		color: var(--text);
		line-height: 1.25;
	}

	.rustdoc :global(pre) {
		overflow-x: auto;
		padding: 0.875rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-sunken);
	}

	.rustdoc :global(code) {
		font-family: var(--font-mono);
	}

	.rustdoc :global(blockquote) {
		margin-left: 0;
		padding-left: 1rem;
		border-left: 3px solid var(--border);
	}
</style>
