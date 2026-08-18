<script lang="ts">
	interface Props {
		html: string;
		label: string;
	}

	let { html, label }: Props = $props();
</script>

<article class="markdown prose" aria-label={label}>
	<!-- Rendered and sanitized by the server-side source Markdown pipeline. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html html}
</article>

<style>
	.markdown { box-sizing: border-box; width: min(100%, 58rem); margin: 0 auto; padding: clamp(1.5rem, 4vw, 3rem); color: var(--text-muted); line-height: 1.7; }
	.markdown :global(h1), .markdown :global(h2), .markdown :global(h3), .markdown :global(h4) { color: var(--text); line-height: 1.25; }
	.markdown :global(h1) { margin-top: 0; }
	.markdown :global(img) { max-width: 100%; }
	.markdown :global(table) { display: block; overflow-x: auto; }
</style>
