<!--
	The toast host, mounted once by the documentation layout.

	Toasts here are strictly for confirming something the reader just did, or reporting that it
	silently failed: a copied command, a copy that the clipboard refused, a link to a symbol the site
	has no page for. Nothing important is ever *only* said in a toast — it disappears, and a reader
	who looked away has no way back to it.

	`svelte-sonner` rather than a hand-rolled queue, because the parts that are easy to get wrong are
	exactly the parts it has already got right: an `aria-live` region that announces without stealing
	focus, stacking and expansion, swipe and keyboard dismissal, and honouring reduced motion. Those
	are the whole substance of a toast component; the queue is the trivial part.

	Themed through its CSS custom properties so it reads from the site's own tokens rather than
	shipping a second palette that drifts from this one. `theme="system"` leaves light and dark to the
	same `light-dark()` tokens everything else uses.

	**Nothing is imported until a toast is asked for.** The library is a fair chunk of JavaScript to
	put in front of every reader for a feature that only responds to interaction, so the import is
	deferred to the first notification — see `notify.svelte.ts`, which flips `toaster.requested`.
	Until then this renders nothing at all.
-->
<script lang="ts">
	import { toaster } from '../notify.svelte.ts';

	const Toaster = $derived(
		toaster.requested ? import('svelte-sonner').then((module) => module.Toaster) : undefined
	);
</script>

<div class="notifications">
	{#if Toaster}
		{#await Toaster then Component}
			<Component
				theme="system"
				position="bottom-right"
				closeButton
				duration={4000}
				visibleToasts={3}
				toastOptions={{ class: 'docs-toast' }}
			/>
		{/await}
	{/if}
</div>

<style>
	/*
	 * The variables sonner reads, pointed at the site's tokens. Scoped to a wrapper rather than
	 * written on `:root`, so the mapping lives with the component it is for.
	 *
	 * `:global` is required because the toaster's markup is rendered by the library, so Svelte's
	 * scoping would otherwise leave every one of these selectors matching nothing.
	 */
	.notifications :global([data-sonner-toaster]) {
		--normal-bg: var(--surface-raised);
		--normal-text: var(--text);
		--normal-border: var(--border);
		--success-bg: var(--tone-success-surface);
		--success-text: var(--tone-success);
		--success-border: var(--border);
		--error-bg: var(--tone-danger-surface);
		--error-text: var(--tone-danger);
		--error-border: var(--border);
		--border-radius: var(--radius);

		font-family: var(--font-sans);
	}

	.notifications :global(.docs-toast) {
		box-shadow: 0 8px 28px color-mix(in srgb, var(--shadow) 45%, transparent);
		font-size: 0.875rem;
	}

	.notifications :global(.docs-toast [data-description]) {
		color: var(--text-muted);
		font-size: 0.8125rem;
	}

	/* A path in a toast is code, and reads as code. */
	.notifications :global(.docs-toast code) {
		font-family: var(--font-mono);
		font-size: 0.8125em;
	}
</style>
