<!--
	Copies a string to the clipboard and confirms it.

	The confirmation is the point: without it a reader cannot tell a successful copy from a silently
	failed one, and clipboard writes do fail (insecure origins, denied permissions). A failure says so
	rather than pretending.
-->
<script lang="ts">
	import { getDocsNotifier } from '../context.ts';

	interface Props {
		text: string;
		label?: string;
		/** What the toast names as copied. Defaults to the text itself, which suits a short command. */
		describes?: string;
	}

	let { text, label = 'Copy', describes }: Props = $props();
	const notifier = getDocsNotifier();

	type State = 'idle' | 'copied' | 'failed';

	let state = $state<State>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy(): Promise<void> {
		clearTimeout(timer);

		try {
			await navigator.clipboard.writeText(text);
			state = 'copied';
			notifier?.copied(describes ?? text);
		} catch {
			state = 'failed';
			notifier?.copyFailed();
		}

		timer = setTimeout(() => {
			state = 'idle';
		}, 2000);
	}

	const caption = $derived(state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label);
</script>

<button class="copy" type="button" data-state={state} onclick={copy} aria-label={caption} title={caption}>
	{#if state === 'copied'}
		<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 4.5 6.5 11 3 7.5" /></svg>
	{:else if state === 'failed'}
		<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
	{:else}
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
			<path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H4a1.5 1.5 0 0 0-1.5 1.5V9A1.5 1.5 0 0 0 4 10.5h1.5" />
		</svg>
	{/if}
	<span class="copy__text">{caption}</span>
</button>

<style>
	.copy {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.4rem;
		border: 1px solid transparent;
		border-radius: calc(var(--radius) - 2px);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
		font: inherit;
		font-size: 0.75rem;
		line-height: 1;
	}

	.copy:hover {
		border-color: var(--border);
		background: var(--surface);
		color: var(--text);
	}

	.copy[data-state='copied'] {
		color: var(--tone-success);
	}

	.copy[data-state='failed'] {
		color: var(--tone-danger);
	}

	.copy svg {
		width: 0.875rem;
		height: 0.875rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* The label is for assistive technology and wide viewports; the icon carries it otherwise. */
	.copy__text {
		display: none;
	}

	@media (min-width: 40rem) {
		.copy__text {
			display: inline;
		}
	}
</style>
