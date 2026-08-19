<script lang="ts">
	import type { ReleaseNoticeData } from './release-notice.ts';

	interface Props {
		notice?: ReleaseNoticeData;
		mode?: 'reading' | 'source';
	}

	let { notice, mode = 'reading' }: Props = $props();
</script>

{#if notice}
	<aside class:release-notice--source={mode === 'source'} class="release-notice" aria-label="Release notice">
		<strong>Older release.</strong>
		<span>You are viewing {notice.currentLabel}.</span>
		<a href={notice.href}>View the latest release ({notice.latestLabel})</a>.
	</aside>
{/if}

<style>
	.release-notice {
		box-sizing: border-box;
		margin: 0 0 1.5rem;
		padding: 0.7rem 0.85rem;
		border: 1px solid color-mix(in srgb, var(--tone-warning) 45%, var(--border));
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--tone-warning) 9%, var(--surface-raised));
		color: var(--text-muted);
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.release-notice strong {
		margin-right: 0.35rem;
		color: var(--text);
	}

	.release-notice span {
		margin-right: 0.35rem;
	}

	.release-notice a {
		color: var(--accent);
		font-weight: 600;
	}

	.release-notice--source {
		margin: 0;
		border-width: 0 0 1px;
		border-radius: 0;
	}
</style>
