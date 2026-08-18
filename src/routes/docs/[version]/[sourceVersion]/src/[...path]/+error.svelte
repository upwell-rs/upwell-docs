<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getDocsNotifier } from '@upwell/docs-ui/context';

	const notifier = getDocsNotifier();

	onMount(() => {
		notifier?.failed('Could not load source', page.error?.message);
	});
</script>

<section class="source-error">
	<p>{page.status}</p>
	<h1>Could not load source</h1>
	<p>{page.error?.message}</p>
	<button type="button" onclick={() => location.reload()}>Try again</button>
</section>

<style>
	.source-error { box-sizing: border-box; height: 100%; padding: clamp(2rem, 8vw, 6rem); background: var(--surface-sunken); }
	.source-error > p:first-child { color: var(--accent); font-family: var(--font-mono); }
	.source-error h1 { margin: 0.5rem 0; }
	.source-error p { color: var(--text-muted); }
	.source-error button { margin-top: 1rem; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); color: var(--text); cursor: pointer; }
</style>
