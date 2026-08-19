<script lang="ts">
	import type { Snippet } from 'svelte';

	import GuideRef from './GuideRef.svelte';
	import SrcRef from './SrcRef.svelte';
	import SymbolRef from './SymbolRef.svelte';

	interface Props {
		customGuide?: Snippet;
		customSymbol?: Snippet;
		customSource?: Snippet;
	}

	let { customGuide, customSymbol, customSource }: Props = $props();
</script>

{#if customGuide}
	<GuideRef slug="/getting-started/" data-kind="guide" class="guide-ref">{@render customGuide()}</GuideRef>
{:else}
	<GuideRef slug="/getting-started/" data-kind="guide" class="guide-ref" />
{/if}
<GuideRef slug="/configuration/" data-kind="guide-default" />
<GuideRef slug="/configuration/" fragment="#advanced-options" data-kind="guide-fragment" />

<SymbolRef path="::framework::App::" data-kind="symbol" />
{#if customSymbol}
	<SymbolRef path="/extra/Client/" source="/framework-extra/" data-kind="symbol-custom">{@render customSymbol()}</SymbolRef>
{:else}
	<SymbolRef path="/extra/Client/" source="/framework-extra/" data-kind="symbol-custom" />
{/if}
<SymbolRef path="extra::Pinned" source="framework-extra" version="extra-v1" data-kind="symbol-version" />

<SrcRef path="/crates/app/src/odd#name.rs/" data-kind="source" />
{#if customSource}
	<SrcRef path="/src/lib.rs/" source="/framework-extra/" data-kind="source-custom">{@render customSource()}</SrcRef>
{:else}
	<SrcRef path="/src/lib.rs/" source="/framework-extra/" data-kind="source-custom" />
{/if}
