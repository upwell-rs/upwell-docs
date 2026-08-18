<script lang="ts">
	import type { SourceCandidate } from '../../server/source.ts';

	interface Props {
		candidates: readonly SourceCandidate[];
		anchor: HTMLElement;
		onclose: () => void;
	}

	let { candidates, anchor, onclose }: Props = $props();
	let top = $state(0);
	let left = $state(0);

	$effect(() => {
		const rect = anchor.getBoundingClientRect();
		top = Math.min(rect.bottom + 8, window.innerHeight - 320);
		left = Math.min(rect.left, window.innerWidth - 390);
	});
</script>

<aside class="candidates" style={`--top: ${Math.max(top, 8)}px; --left: ${Math.max(left, 8)}px`} aria-label="Possible symbols">
	<header><strong>Choose symbol</strong><button type="button" onclick={onclose}>Close</button></header>
	<ul>
		{#each candidates as candidate (candidate.symbol)}
			<li>
				<a href={candidate.href}>
					<span>{candidate.kind.replace('_', ' ')}</span>
					<strong>{candidate.symbol}</strong>
					{#if candidate.signature}<code>{candidate.signature}</code>{/if}
					{#if candidate.doc}<small>{candidate.doc}</small>{/if}
				</a>
			</li>
		{/each}
	</ul>
</aside>

<style>
	.candidates { position: fixed; z-index: 80; top: var(--top); left: var(--left); width: min(23rem, calc(100vw - 1rem)); max-height: 19rem; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); box-shadow: 0 14px 40px color-mix(in srgb, var(--shadow) 38%, transparent); }
	header { display: flex; justify-content: space-between; padding: 0.65rem 0.8rem; border-bottom: 1px solid var(--border); }
	header button { border: 0; background: none; color: var(--text-muted); cursor: pointer; }
	ul { max-height: 16rem; margin: 0; padding: 0.35rem; overflow: auto; list-style: none; }
	a { display: grid; gap: 0.18rem; padding: 0.6rem; border-radius: 4px; color: var(--text); text-decoration: none; }
	a:hover { background: var(--surface-sunken); }
	a > span { color: var(--lens-value); font-size: 0.65rem; letter-spacing: 0.06em; text-transform: uppercase; }
	a > strong, code { overflow: hidden; font-family: var(--font-mono); font-size: 0.75rem; text-overflow: ellipsis; white-space: nowrap; }
	code, small { color: var(--text-muted); }
	small { line-height: 1.4; }
</style>
