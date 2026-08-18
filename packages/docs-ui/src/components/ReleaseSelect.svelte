<!--
	The release being read, and the list of the others.

	Its own component because it appears twice: in the header on viewports wide enough for it, and
	inside the narrow-viewport menu, which is the only place a phone can reach it. Two copies of one
	`<select>` would otherwise drift, and they must not — a versioned documentation site that shows the
	wrong release is worse than one that shows none.
-->
<script lang="ts">
	import type { DocsVersion } from '../types.ts';

	interface Props {
		version: DocsVersion;
		versions: readonly DocsVersion[];
		onversionchange: (id: string) => void;
		/** Distinguishes the label's target when the page holds more than one of these. */
		id?: string;
	}

	let { version, versions, onversionchange, id = 'docs-version' }: Props = $props();
</script>

<nav class="release" aria-label="Release">
	<label class="release__label" for={id}>Release</label>
	<select
		{id}
		class="release__select"
		onchange={(event) => {
			const selected = event.currentTarget;
			onversionchange(selected.value);
		}}
	>
		{#each versions as option (option.id)}
			<option value={option.id} selected={option.id === version.id}>
				{option.label}
			</option>
		{/each}
	</select>
</nav>

<style>
	.release {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.release__label {
		display: none;
		color: var(--text-subtle);
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	@media (min-width: 48rem) {
		.release__label {
			display: inline-block;
		}
	}

	.release__select {
		padding: 0.2rem 0.4rem;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) - 2px);
		background: var(--surface-raised);
		color: var(--text);
		font: inherit;
		font-size: 0.8125rem;
	}
</style>
