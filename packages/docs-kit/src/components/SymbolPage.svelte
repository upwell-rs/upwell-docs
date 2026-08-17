<script lang="ts">
	import type { Component } from 'svelte';
	import { setSymbolInfo } from '@upwell/docs-ui/context';
	import type { DocsVersion } from '@upwell/docs-core/config';
	import type { SymbolPageSummary } from '@upwell/docs-core/content';
	import type { SymbolInfo } from '@upwell/docs-ui/types';

	interface Props {
		version: DocsVersion;
		page: SymbolPageSummary;
		symbol: SymbolInfo;
		component: Component | undefined;
	}

	let { version, page, symbol, component: Content }: Props = $props();

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
{/if}
