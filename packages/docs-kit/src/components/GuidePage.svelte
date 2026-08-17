<script lang="ts">
	import type { Component } from 'svelte';
	import type { DocsVersion } from '@upwell/docs-core/config';
	import type { DocSummary } from '@upwell/docs-core/content';

	interface Props {
		version: DocsVersion;
		page: DocSummary;
		component: Component | undefined;
	}

	let { version, page, component: Content }: Props = $props();
</script>

<svelte:head>
	<title>{page.title} · {version.label}</title>
	{#if page.description}
		<meta name="description" content={page.description} />
	{/if}
</svelte:head>

{#if Content}
	<Content />
{/if}
