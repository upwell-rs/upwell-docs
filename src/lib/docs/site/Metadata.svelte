<script lang="ts">
	import { docsConfig } from 'virtual:docs-config';

	import { siteOrigin } from '../site.ts';
	import { resolvePageMetadata, type PageMetadata } from './metadata.ts';

	interface Props {
		metadata: PageMetadata | undefined;
	}

	let { metadata }: Props = $props();

	const resolved = $derived(
		metadata
			? resolvePageMetadata(metadata, { name: docsConfig.framework.name, origin: siteOrigin })
			: undefined
	);
</script>

<svelte:head>
	<meta name="color-scheme" content="light dark" />
	<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#0e1116" media="(prefers-color-scheme: dark)" />
	{#if resolved}
		<title>{resolved.fullTitle}</title>
		<meta name="description" content={resolved.description} />
		<link rel="canonical" href={resolved.url} />
		<meta property="og:type" content="website" />
		<meta property="og:site_name" content={docsConfig.framework.name} />
		<meta property="og:title" content={resolved.fullTitle} />
		<meta property="og:description" content={resolved.description} />
		<meta property="og:url" content={resolved.url} />
		<meta name="twitter:card" content="summary" />
		<meta name="twitter:title" content={resolved.fullTitle} />
		<meta name="twitter:description" content={resolved.description} />
	{/if}
</svelte:head>
