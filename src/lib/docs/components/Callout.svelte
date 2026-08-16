<!--
	An aside that breaks the reading flow on purpose.

	Four kinds, because more would make the choice arbitrary and the page noisy: `info` for context,
	`tip` for a better way, `warning` for a foot-gun, and `danger` for something that loses data or
	breaks production.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type CalloutKind = 'info' | 'tip' | 'warning' | 'danger';

	interface Props {
		type?: CalloutKind;
		/** Overrides the default heading for the kind. */
		title?: string;
		children: Snippet;
	}

	const DEFAULT_TITLES: Record<CalloutKind, string> = {
		info: 'Note',
		tip: 'Tip',
		warning: 'Warning',
		danger: 'Careful'
	};

	let { type = 'info', title, children }: Props = $props();

	const heading = $derived(title ?? DEFAULT_TITLES[type]);
</script>

<aside class="callout" data-kind={type}>
	<p class="callout__title">{heading}</p>
	<div class="callout__body">{@render children()}</div>
</aside>

<style>
	.callout {
		margin: 1.5rem 0;
		padding: 0.875rem 1rem;
		border-left: 3px solid var(--callout-accent);
		border-radius: 0 var(--radius) var(--radius) 0;
		background: var(--callout-surface);
	}

	.callout[data-kind='info'] {
		--callout-accent: var(--tone-info);
		--callout-surface: var(--tone-info-surface);
	}

	.callout[data-kind='tip'] {
		--callout-accent: var(--tone-success);
		--callout-surface: var(--tone-success-surface);
	}

	.callout[data-kind='warning'] {
		--callout-accent: var(--tone-warning);
		--callout-surface: var(--tone-warning-surface);
	}

	.callout[data-kind='danger'] {
		--callout-accent: var(--tone-danger);
		--callout-surface: var(--tone-danger-surface);
	}

	.callout__title {
		margin: 0 0 0.25rem;
		color: var(--callout-accent);
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.callout__body :global(> :first-child) {
		margin-top: 0;
	}

	.callout__body :global(> :last-child) {
		margin-bottom: 0;
	}
</style>
