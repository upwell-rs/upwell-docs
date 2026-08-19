<script lang="ts">
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import Metadata from '#lib/docs/site/Metadata.svelte';
	import type { PageMetadata } from '#lib/docs/site/metadata';
	import '@upwell/docs-ui/styles.css';

	let { children } = $props();

	const metadata = $derived(page.data.metadata as PageMetadata | undefined);
</script>

<svelte:head><link rel="icon" type="image/svg+xml" href={favicon} /></svelte:head>

<Metadata {metadata} />

{@render children()}
