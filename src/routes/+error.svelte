<!--
	The error page.

	A missing symbol is the common case here, so it gets the treatment it deserves: the suggestions
	computed server-side are rendered as links. Typing a symbol path by hand, or following one from an
	older release, should land somewhere useful rather than on an apology.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { latestVersion } from '@upwell/docs-core/config';
	import { docsConfig } from 'virtual:docs-config';

	const suggestions = $derived(page.error?.suggestions ?? []);
	const version = $derived(page.params.version ?? latestVersion(docsConfig).id);

	function href(symbol: string): string {
		return `/docs/${version}/symbols/${symbol.replaceAll('::', '/')}`;
	}
</script>

<svelte:head><title>{page.status} · {docsConfig.framework.name} docs</title></svelte:head>

<main class="error">
	<p class="error__status">{page.status}</p>
	<h1 class="error__title">{page.status === 404 ? 'Not found' : 'Something went wrong'}</h1>

	{#if page.error?.message}
		<p class="error__message">{page.error.message}</p>
	{/if}

	{#if suggestions.length > 0}
		<h2 class="error__heading">Did you mean</h2>
		<ul class="error__suggestions">
			{#each suggestions as suggestion (suggestion)}
				<li><a href={href(suggestion)}><code>{suggestion}</code></a></li>
			{/each}
		</ul>
	{/if}

	<p class="error__actions">
		<a href="/docs/{version}">Documentation home</a>
	</p>
</main>

<style>
	.error {
		max-width: 40rem;
		margin: 0 auto;
		padding: 5rem 1.5rem;
	}

	.error__status {
		margin: 0;
		color: var(--text-subtle);
		font-family: var(--font-mono);
		font-size: 0.875rem;
	}

	.error__title {
		margin: 0.25rem 0 1rem;
		font-size: 1.75rem;
		letter-spacing: -0.02em;
	}

	.error__message {
		margin: 0 0 1.5rem;
		color: var(--text-muted);
	}

	.error__heading {
		margin: 0 0 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-subtle);
	}

	.error__suggestions {
		margin: 0 0 1.5rem;
		padding-left: 1.25rem;
	}

	.error__actions {
		margin: 0;
	}
</style>
