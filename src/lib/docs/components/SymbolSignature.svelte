<!--
	The documented symbol's signature, as rustdoc rendered it.

	Dropped into a hand-written symbol page wherever the signature belongs. Taking it from the build
	rather than the prose means it cannot disagree with the release the page is being read under.
-->
<script lang="ts">
	import { getSymbolInfo } from '../symbol.svelte.ts';

	const symbol = getSymbolInfo();
</script>

{#if symbol.signature}
	<pre class="signature"><code>{symbol.signature}</code></pre>
{/if}

<style>
	.signature {
		margin: 1.25rem 0;
		padding: 0.75rem 1rem;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-sunken);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		line-height: 1.6;
	}
</style>
