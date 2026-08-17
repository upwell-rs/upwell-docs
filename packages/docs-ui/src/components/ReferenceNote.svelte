<!--
	The way back from reference material into the guides.

	A symbol page has no previous or next, because it is not part of the reading order. This is not
	an explanation of that — the sidebar already places these pages — only the link a reader would
	otherwise have to go looking for.
-->
<script lang="ts">
	interface Props {
		/** Where to return to, usually the release's landing page. */
		backTo: { href: string; title: string };
	}

	let { backTo }: Props = $props();
</script>

<nav class="reference" aria-label="Return to guides">
	<a class="reference__back" href={backTo.href}>&larr; {backTo.title}</a>
</nav>

<style>
	.reference {
		margin-top: 3rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
		font-size: 0.875rem;
	}

	.reference__back {
		text-decoration: none;
	}

	.reference__back:hover {
		text-decoration: underline;
	}
</style>
