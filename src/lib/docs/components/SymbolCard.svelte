<!--
	The hover card for a symbol in a code block.

	Every field it shows was resolved at build time and travels on the token itself, so opening a card
	costs no network request and no work beyond positioning. Anything the index did not have is simply
	absent — the card never shows a placeholder for missing documentation, because an empty section
	reads as "undocumented" when the truth is "not applicable".
-->
<script lang="ts" module>
	export interface SymbolCardData {
		path: string;
		kind: string;
		signature?: string;
		/** First paragraph of the symbol's `///` comment. */
		summary?: string;
		feature?: string;
		deprecated?: string;
		sourceHref?: string;
		/** Destination from the defined references, when the symbol has one. */
		documentedAt?: { href: string; title: string };
		/**
		 * Set when the token is a local rather than a framework symbol.
		 *
		 * The card then reads `app: App` and describes the *type*, because that is the only useful
		 * thing to say about a variable — and saying it as though the variable were the symbol would
		 * be wrong.
		 */
		variable?: string;
		/**
		 * Set when the name was declared by the snippet itself.
		 *
		 * Says where its definition is, in place of the crate and feature a framework symbol would
		 * carry — an example's own type has none of those, and pretending otherwise would suggest it
		 * is part of the framework.
		 */
		definedInPage?: string;
		/**
		 * Set when the symbol belongs to another crate.
		 *
		 * The card then says which crate and links out, because that is the whole of what this site
		 * knows about it — the external tier records a path, a kind and a destination, deliberately
		 * not a signature or documentation. See `tools/docs/rustdoc/externals.ts`.
		 */
		externalCrate?: string;
	}
</script>

<script lang="ts">
	interface Props {
		data: SymbolCardData;
		anchor: HTMLElement;
		/** Bound so the article can keep the card open while the pointer is inside it. */
		element?: HTMLElement;
	}

	let { data, anchor, element = $bindable() }: Props = $props();

	/**
	 * Positions the card under its token, nudged inward when it would leave the viewport.
	 *
	 * Measured after mount rather than computed from CSS, because the card's height depends on how
	 * much documentation the symbol has.
	 */
	$effect(() => {
		if (!element) {
			return;
		}

		const target = anchor.getBoundingClientRect();
		const own = element.getBoundingClientRect();
		const margin = 12;

		const left = Math.min(Math.max(margin, target.left), window.innerWidth - own.width - margin);
		const below = target.bottom + 4;
		const fitsBelow = below + own.height < window.innerHeight - margin;

		element.style.left = `${left}px`;
		// Sits closer to the token than the pointer can travel in one frame, so moving towards the
		// card does not cross a gap that would register as leaving both.
		element.style.top = `${fitsBelow ? below : target.top - own.height - 4}px`;
	});
</script>

<div bind:this={element} class="card" role="tooltip">
	<p class="card__path">
		{#if data.externalCrate && data.variable}
			<span class="card__kind">local · {data.externalCrate}</span>
			<code><span class="card__variable">{data.variable}</span>: {data.path}</code>
		{:else if data.externalCrate}
			<span class="card__kind">{data.kind.replace('_', ' ')} · {data.externalCrate}</span>
			<code>{data.path}</code>
		{:else if data.definedInPage}
			<span class="card__kind">{data.kind.replace('_', ' ')} · in this example</span>
			<code>{data.path}</code>
		{:else if data.variable}
			<span class="card__kind">local</span>
			<code><span class="card__variable">{data.variable}</span>: {data.path}</code>
		{:else}
			<span class="card__kind">{data.kind.replace('_', ' ')}</span>
			<code>{data.path}</code>
		{/if}
	</p>

	{#if data.signature}
		<pre class="card__signature"><code>{data.signature}</code></pre>
	{/if}

	{#if data.deprecated}
		<p class="card__deprecated">Deprecated — {data.deprecated}</p>
	{/if}

	{#if data.summary}
		<p class="card__summary">{data.summary}</p>
	{/if}

	{#if data.feature}
		<p class="card__feature">Requires the <code>{data.feature}</code> feature</p>
	{/if}

	{#if data.definedInPage}
		<p class="card__feature">{data.definedInPage} — click to jump there</p>
	{/if}

	<p class="card__links">
		{#if data.documentedAt}
			<a href={data.documentedAt.href}>{data.documentedAt.title}</a>
		{/if}
		{#if data.sourceHref}
			<a href={data.sourceHref} rel="noreferrer">View source</a>
		{/if}
	</p>
</div>

<style>
	.card {
		position: fixed;
		z-index: 40;
		max-width: min(32rem, calc(100vw - 2rem));
		padding: 0.75rem 0.875rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		box-shadow: 0 8px 28px color-mix(in srgb, var(--shadow) 60%, transparent);
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.card p {
		margin: 0 0 0.5rem;
	}

	.card p:last-child {
		margin-bottom: 0;
	}

	.card__kind {
		margin-right: 0.4rem;
		color: var(--text-subtle);
		font-size: 0.6875rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.card__path code {
		background: none;
		padding: 0;
		font-size: 0.8125rem;
	}

	.card__variable {
		color: var(--text-muted);
	}

	.card__signature {
		margin: 0 0 0.5rem;
		padding: 0.4rem 0.5rem;
		overflow-x: auto;
		border-radius: calc(var(--radius) - 2px);
		background: var(--surface-sunken);
		font-size: 0.75rem;
	}

	.card__summary {
		color: var(--text-muted);
	}

	.card__deprecated {
		color: var(--tone-warning);
	}

	.card__feature {
		color: var(--text-subtle);
	}

	.card__feature code {
		font-size: 0.75rem;
	}

	.card__links {
		display: flex;
		gap: 0.75rem;
		font-size: 0.75rem;
	}

	.card__links:empty {
		display: none;
	}
</style>
