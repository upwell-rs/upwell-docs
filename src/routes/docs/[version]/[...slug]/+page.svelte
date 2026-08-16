<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const Content = $derived(data.component);
</script>

<svelte:head>
	<title>{data.page.title} · {data.version.label}</title>
	{#if data.page.description}
		<meta name="description" content={data.page.description} />
	{/if}
</svelte:head>

<Content />
