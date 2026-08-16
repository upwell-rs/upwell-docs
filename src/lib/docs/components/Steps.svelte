<!--
	An ordered procedure.

	Each `h3` inside becomes a numbered step, so authors keep writing ordinary markdown headings and
	the numbering, rule and spacing come from CSS. Wrapping every step in a component would make the
	markdown unreadable in source, which is where it is edited.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="steps">{@render children()}</div>

<style>
	.steps {
		counter-reset: step;
		margin: 1.5rem 0;
		padding-left: 2rem;
		border-left: 1px solid var(--border);
	}

	.steps :global(h3) {
		counter-increment: step;
		position: relative;
		margin-top: 1.75rem;
		font-size: 1rem;
	}

	.steps :global(h3:first-child) {
		margin-top: 0;
	}

	.steps :global(h3)::before {
		content: counter(step);
		position: absolute;
		left: -2.75rem;
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 500;
	}
</style>
