<!--
	Both directions of the impl graph, whichever the documented symbol has.

	A type shows the traits it implements; a trait shows the types implementing it. They are rendered
	by one component because a page never has both — a symbol is one or the other — and because the
	pair is one idea, which is what a reader is asking when they look at either.

	Compiler-synthesised and blanket impls are excluded upstream, so what is left is what actually
	characterises the type: its derives and the framework traits it participates in.

	An implementor that has a page of its own is a link. One that does not is still named: knowing
	that a trait has eleven implementors, and what they are called, is worth more than a list that
	silently omits the ten nobody has written a page for yet.
-->
<script lang="ts">
	import { getSymbolInfo } from '../context.ts';

	const symbol = getSymbolInfo();
</script>

{#if symbol.implementations.length > 0}
	<section class="impls">
		<h2 class="impls__title">Implements</h2>
		<ul class="impls__list">
			{#each symbol.implementations as trait (trait)}
				<li><code>{trait}</code></li>
			{/each}
		</ul>
	</section>
{/if}

{#if symbol.implementors.length > 0}
	<section class="impls">
		<h2 class="impls__title">Implementors</h2>
		<ul class="impls__list">
			{#each symbol.implementors as implementor (implementor.path)}
				<li>
					{#if implementor.href}
						<a href={implementor.href} title={implementor.path}><code>{implementor.name}</code></a>
					{:else}
						<code title={implementor.path}>{implementor.name}</code>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.impls {
		margin: 1.5rem 0;
	}

	.impls__title {
		margin: 0 0 0.5rem;
		color: var(--text-subtle);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.impls__list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.impls__list code {
		padding: 0.1em 0.4em;
		border-radius: 4px;
		background: var(--surface-raised);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}

	.impls__list a {
		text-decoration: none;
	}

	.impls__list a code {
		background: var(--accent-surface);
		color: var(--accent);
	}
</style>
