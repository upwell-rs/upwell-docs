<script lang="ts">
	import DocsAppFrame from '#lib/docs/site/DocsAppFrame.svelte';
	import { docsClient, docsContent } from '#lib/docs/runtime';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<DocsAppFrame content={docsContent} searchIndex={docsClient.searchIndex} sidebar={docsClient.sidebar} notifications={docsClient.notifications}>
	{@render children()}
</DocsAppFrame>
