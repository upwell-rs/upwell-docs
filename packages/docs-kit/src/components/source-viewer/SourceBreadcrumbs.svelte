<script lang="ts">
	import { sourceBreadcrumbs } from './model.ts';

	interface Props {
		source: string;
		path: string;
		baseHref: string;
	}

	let { source, path, baseHref }: Props = $props();
	const breadcrumbs = $derived(sourceBreadcrumbs(path));
</script>

<nav class="path" aria-label="Source path">
	<a href={baseHref}>{source}</a>
	{#each breadcrumbs as crumb (crumb.path)}
		<span aria-hidden="true">/</span>
		{#if crumb.current}
			<strong aria-current="page">{crumb.name}</strong>
		{:else}
			<a href={`${baseHref}${crumb.path}`}>{crumb.name}</a>
		{/if}
	{/each}
</nav>

<style>
	.path { display: flex; min-width: 0; align-items: center; gap: 0.4rem; overflow: hidden; font-family: var(--font-mono); font-size: 0.8rem; white-space: nowrap; }
	.path a { color: var(--text-muted); text-decoration: none; }
	.path a:hover { color: var(--text); }
	.path strong { overflow: hidden; text-overflow: ellipsis; }
</style>
