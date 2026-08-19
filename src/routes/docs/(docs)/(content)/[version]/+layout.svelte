<script lang="ts">
	import ReadingArea from '#lib/docs/site/ReadingArea.svelte';
	import { docsClient, docsContent } from '#lib/docs/runtime';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<ReadingArea area="guide" content={docsContent} version={data.version} sidebar={docsClient.sidebar}>{@render children()}</ReadingArea>
