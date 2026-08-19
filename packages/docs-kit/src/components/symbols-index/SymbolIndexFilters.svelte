<script lang="ts">
	interface Props {
		crates: readonly string[];
		query?: string;
		crate?: string;
	}

	let { crates, query = $bindable(''), crate = $bindable('all') }: Props = $props();
</script>

<div class="filters">
	<label>
		<span>Find a symbol</span>
		<input bind:value={query} type="search" placeholder="Try component or AxumConfig" />
	</label>
	<label>
		<span>Crate</span>
		<select bind:value={crate}>
			<option value="all">All crates</option>
			{#each crates as name (name)}<option value={name}>{name}</option>{/each}
		</select>
	</label>
</div>

<style>
	.filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(10rem, 16rem); gap: 0.75rem; margin: 1.5rem 0 0.75rem; }
	.filters label { display: grid; gap: 0.3rem; color: var(--text-subtle); font-size: 0.75rem; font-weight: 600; }
	.filters input, .filters select { min-width: 0; padding: 0.6rem 0.7rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); color: var(--text); font: inherit; }
	@media (max-width: 36rem) { .filters { grid-template-columns: 1fr; } }
</style>
