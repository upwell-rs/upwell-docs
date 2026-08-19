<script lang="ts">
	import type { SymbolRecord } from './filter-symbol-records.ts';

	interface Props {
		record: SymbolRecord;
	}

	let { record }: Props = $props();
</script>

<div class="symbol__heading">
	<a href={record.href}><code>{record.path}</code></a>
	<span class="kind">{record.kind}</span>
	{#if record.authored}<span class="authored">curated</span>{/if}
</div>
{#if record.summary}<p>{record.summary}</p>{/if}

<style>
	.symbol__heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; }
	a { text-decoration: none; }
	code { font-family: var(--font-mono); font-size: 0.875rem; }
	.kind, .authored { color: var(--text-subtle); font-size: 0.6875rem; letter-spacing: 0.05em; text-transform: uppercase; }
	.authored { color: var(--accent); }
	p { margin: 0.3rem 0 0; color: var(--text-muted); font-size: 0.875rem; }
</style>
