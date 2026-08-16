<!--
	Several code blocks that make up one worked example.

	Two things at once, and they are the same idea seen from either end.

	**Visually** it groups blocks and the prose between them, so a reader can see that four fences and
	three paragraphs are one example being built up rather than four unrelated snippets.

	**At build time** the blocks inside share their declarations. A type declared in the first block
	is a resolvable name in the third, so `greeter.greet()` at the end of an example annotates against
	the `struct Greeter` that opened it. Without the wrapper each block only knows itself, and the
	names the example just introduced are exactly the ones that go unmarked.

	It is opt-in for a reason. Sharing declarations across a whole page would make an unrelated
	example further up able to answer for a name here — a wrong annotation rather than a missing one —
	and would make every page pay for something most pages do not need. The wrapper is what states
	that these particular blocks are one context.

	```svx
	<Example title="A first component">

	```rust
	struct Greeter { prefix: String }
	```

	Then use it:

	```rust
	let message = greeter.greet("world");
	```

	</Example>
	```

	The preprocessor that reads the blocks matches this tag by name in the page source, so it must be
	written as a literal `<Example>` — not aliased on import, and not rendered through another
	component.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Names the example. Rendered as a caption above it. */
		title?: string;
		children: Snippet;
	}

	let { title, children }: Props = $props();
</script>

<section class="example">
	{#if title}
		<p class="example__title">{title}</p>
	{/if}

	<div class="example__body">
		{@render children()}
	</div>
</section>

<style>
	.example {
		margin: 1.5rem 0;
		padding: 0.875rem 1rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--surface-raised) 55%, transparent);
	}

	.example__title {
		margin: 0 0 0.625rem;
		color: var(--text-subtle);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	/*
	 * The blocks inside sit closer together than they would in flowing prose: they are steps of one
	 * example, and the default spacing reads as separate topics.
	 */
	.example__body > :global(:first-child) {
		margin-top: 0;
	}

	.example__body > :global(:last-child) {
		margin-bottom: 0;
	}

	.example__body :global(.code-block) {
		margin: 0.75rem 0;
	}
</style>
