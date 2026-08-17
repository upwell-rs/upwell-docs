<!--
	The mechanical facts about the documented symbol: kind, crate, required feature, deprecation,
	and where it is defined.

	Everything here comes from the build, so a page states it once by placing this component and
	never has to keep it current. Fields the release does not have are omitted rather than rendered
	empty — an "unknown" row reads as missing documentation when the truth is "not applicable".
-->
<script lang="ts">
	import { getSymbolInfo } from '../context.ts';
	import Badge from './Badge.svelte';

	const symbol = getSymbolInfo();
	const kindLabel = $derived(
		symbol.procMacro?.kind === 'bang'
			? 'Function-like macro'
			: symbol.procMacro?.kind === 'attribute'
				? 'Attribute macro'
				: symbol.procMacro?.kind === 'derive'
					? 'Derive macro'
					: symbol.kind.replace('_', ' ')
	);
</script>

<div class="meta">
	<p class="meta__path">
		<span class="meta__kind">{kindLabel}</span>
		<code>{symbol.path}</code>
	</p>

	<p class="meta__badges">
		<Badge>{symbol.crate}</Badge>
		{#if symbol.feature}
			<Badge tone="feature">feature: {symbol.feature}</Badge>
		{/if}
		{#if symbol.deprecation}
			<Badge tone="warning">deprecated{symbol.deprecation.since ? ` since ${symbol.deprecation.since}` : ''}</Badge>
		{/if}
	</p>

	{#if symbol.deprecation?.note}
		<p class="meta__deprecated">{symbol.deprecation.note}</p>
	{/if}

	{#if symbol.procMacro?.kind === 'derive' && symbol.procMacro.helpers.length > 0}
		<p class="meta__helpers">
			Helper attributes: {symbol.procMacro.helpers.map((helper) => `#[${helper}]`).join(', ')}
		</p>
	{/if}

	{#if symbol.canonicalPath !== symbol.path}
		<p class="meta__defined">
			Defined as <code>{symbol.canonicalPath}</code> and re-exported.
		</p>
	{/if}

	{#if symbol.sourceHref && symbol.source}
		<p class="meta__source">
			<a href={symbol.sourceHref} rel="noreferrer">{symbol.source.file}:{symbol.source.line}</a>
		</p>
	{/if}
</div>

<style>
	.meta {
		margin: 0 0 1.5rem;
		padding: 0.875rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		font-size: 0.875rem;
	}

	.meta p {
		margin: 0 0 0.5rem;
	}

	.meta p:last-child {
		margin-bottom: 0;
	}

	.meta__kind {
		margin-right: 0.4rem;
		color: var(--text-subtle);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.meta__badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.meta__deprecated {
		color: var(--tone-warning);
	}

	.meta__helpers,
	.meta__defined,
	.meta__source {
		color: var(--text-muted);
		font-size: 0.8125rem;
	}
</style>
