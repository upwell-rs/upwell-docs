<script lang="ts">
	import SourceArea from '#lib/docs/site/SourceArea.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<SourceArea>{@render children()}</SourceArea>
