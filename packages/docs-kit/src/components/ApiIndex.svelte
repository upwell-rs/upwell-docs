<script lang="ts">
	interface Record {
		readonly path: string;
		readonly name: string;
		readonly crate: string;
		readonly kind: string;
		readonly summary: string | null;
		readonly href: string;
		readonly authored: boolean;
	}

	interface Props {
		version: { readonly label: string };
		records: readonly Record[];
	}

	let { version, records }: Props = $props();
	let query = $state('');
	let crate = $state('all');
	const crates = $derived([...new Set(records.map((record) => record.crate))].sort());
	const visible = $derived(records.filter((record) => {
		const wanted = query.trim().toLowerCase();

		return (crate === 'all' || record.crate === crate) && (!wanted || record.path.toLowerCase().includes(wanted) || record.summary?.toLowerCase().includes(wanted));
	}));
</script>

<svelte:head>
	<title>API Reference · {version.label}</title>
	<meta name="description" content="API symbols and authored reference pages for {version.label}." />
</svelte:head>

<h1>API Reference</h1>
<p class="lede">Browse public symbols by Cargo crate. Authored reference pages take precedence over generated entries.</p>

<div class="filters">
	<label>
		<span>Filter symbols</span>
		<input bind:value={query} type="search" placeholder="Type a path or summary" />
	</label>
	<label>
		<span>Crate</span>
		<select bind:value={crate}>
			<option value="all">All crates</option>
			{#each crates as name (name)}<option value={name}>{name}</option>{/each}
		</select>
	</label>
</div>

<p class="count">{visible.length} {visible.length === 1 ? 'symbol' : 'symbols'}</p>
<ul class="symbols">
	{#each visible as record (record.path)}
		<li>
			<a href={record.href}><code>{record.path}</code></a>
			<span class="kind">{record.kind}</span>
			{#if record.authored}<span class="authored">authored</span>{/if}
			{#if record.summary}<p>{record.summary}</p>{/if}
		</li>
	{/each}
</ul>

<style>
	.lede { max-width: 48rem; color: var(--text-muted); }
	.filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(10rem, 16rem); gap: 0.75rem; margin: 1.5rem 0 0.75rem; }
	.filters label { display: grid; gap: 0.3rem; color: var(--text-subtle); font-size: 0.75rem; font-weight: 600; }
	.filters input, .filters select { min-width: 0; padding: 0.6rem 0.7rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); color: var(--text); font: inherit; }
	.count { color: var(--text-subtle); font-size: 0.8125rem; }
	.symbols { margin: 0; padding: 0; list-style: none; }
	.symbols li { padding: 0.75rem 0; border-top: 1px solid var(--border); }
	.symbols a { text-decoration: none; }
	.symbols code { font-family: var(--font-mono); font-size: 0.875rem; }
	.kind, .authored { margin-left: 0.5rem; color: var(--text-subtle); font-size: 0.6875rem; letter-spacing: 0.05em; text-transform: uppercase; }
	.authored { color: var(--accent); }
	.symbols p { margin: 0.3rem 0 0; color: var(--text-muted); font-size: 0.875rem; }
	@media (max-width: 36rem) { .filters { grid-template-columns: 1fr; } }
</style>
