<script lang="ts">
	import { setSymbolInfo } from '#lib/docs/symbol.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The page's own prose, imported by the load beside this. Its symbol's facts reach it through
	// context, so an author can drop in <SymbolSignature /> or read getSymbolInfo() without the route
	// threading props through mdsvex.
	const Content = $derived(data.component);

	setSymbolInfo(() => data.symbol);
</script>

<svelte:head>
	<title>{data.page.title} · {data.version.label}</title>
	{#if data.page.description ?? data.symbol.doc}
		<meta name="description" content={data.page.description ?? data.symbol.doc} />
	{/if}
</svelte:head>

{#if Content}
	<Content />
{/if}
