<!--
	A short inline label: a required feature flag, a version, a deprecation marker.

	Kept deliberately plain. A badge that carries meaning beyond its own text belongs in prose.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		tone?: 'neutral' | 'feature' | 'warning' | 'danger';
		children: Snippet;
	}

	let { tone = 'neutral', children }: Props = $props();
</script>

<span class="badge" data-tone={tone}>{@render children()}</span>

<style>
	.badge {
		display: inline-block;
		padding: 0.05rem 0.4rem;
		border: 1px solid var(--badge-border);
		border-radius: 999px;
		background: var(--badge-surface);
		color: var(--badge-text);
		font-family: var(--font-mono);
		font-size: 0.75em;
		font-weight: 500;
		line-height: 1.5;
		vertical-align: baseline;
		white-space: nowrap;
	}

	.badge[data-tone='neutral'] {
		--badge-border: var(--border);
		--badge-surface: var(--surface-raised);
		--badge-text: var(--text-muted);
	}

	.badge[data-tone='feature'] {
		--badge-border: color-mix(in srgb, var(--tone-info) 40%, transparent);
		--badge-surface: var(--tone-info-surface);
		--badge-text: var(--tone-info);
	}

	.badge[data-tone='warning'] {
		--badge-border: color-mix(in srgb, var(--tone-warning) 40%, transparent);
		--badge-surface: var(--tone-warning-surface);
		--badge-text: var(--tone-warning);
	}

	.badge[data-tone='danger'] {
		--badge-border: color-mix(in srgb, var(--tone-danger) 40%, transparent);
		--badge-surface: var(--tone-danger-surface);
		--badge-text: var(--tone-danger);
	}
</style>
