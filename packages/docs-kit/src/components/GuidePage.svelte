<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		component: Component | undefined;
	}

	let { component: Content }: Props = $props();
</script>

{#if Content}
	<Content />
{/if}
