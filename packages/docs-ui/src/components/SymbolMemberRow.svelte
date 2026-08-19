<script lang="ts">
	import type { SymbolMember } from '../types.ts';
	import RustSignature from './RustSignature.svelte';

	interface Props {
		member: SymbolMember;
		anchor: string;
	}

	const KIND_LABEL: Record<string, string> = {
		method: 'method',
		assoc_fn: 'fn',
		assoc_const: 'const',
		assoc_type: 'type',
		struct_field: 'field',
		variant: 'variant'
	};

	let { member, anchor }: Props = $props();
</script>

<li class="member" id="{anchor}-{member.name}">
	<div class="member__head">
		<code class="member__name" class:member__name--deprecated={member.deprecated}>{member.name}</code>
		<span class="member__kind">{KIND_LABEL[member.kind] ?? member.kind}</span>
		{#if member.deprecated}
			<span class="member__deprecated">deprecated</span>
		{/if}
		{#if member.sourceHref}
			<a class="member__source" href={member.sourceHref} rel="noreferrer">source</a>
		{/if}
	</div>

	{#if member.signature}
		<RustSignature code={member.signature} class="member__signature" />
	{/if}

	{#if member.doc}
		<p class="member__doc">{member.doc}</p>
	{/if}
</li>

<style>
	.member {
		padding: 0.75rem 0;
		border-top: 1px solid var(--border);
	}

	.member:last-child {
		border-bottom: 1px solid var(--border);
	}

	.member__head {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.member__name {
		background: none;
		padding: 0;
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.member__name--deprecated {
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, currentColor 50%, transparent);
	}

	.member__kind {
		color: var(--text-subtle);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.member__deprecated {
		color: var(--tone-warning);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.member__source {
		margin-left: auto;
		color: var(--text-subtle);
		font-size: 0.75rem;
		text-decoration: none;
	}

	.member__source:hover {
		color: var(--accent);
	}

	:global(.member__signature) {
		margin: 0.4rem 0 0;
		padding: 0.5rem 0.75rem;
		overflow-x: auto;
		border-radius: calc(var(--radius) - 2px);
		background: var(--surface-sunken);
		font-family: var(--font-mono);
		font-size: 0.78125rem;
		line-height: 1.6;
	}

	.member__doc {
		margin: 0.5rem 0 0;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
</style>
