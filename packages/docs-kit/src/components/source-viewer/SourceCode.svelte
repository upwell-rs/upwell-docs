<script lang="ts">
	import type { Attachment } from 'svelte/attachments';

	import { SymbolCard } from '@upwell/docs-ui';
	import {
		createSourceSymbolCardInteractions,
		type ActiveSymbolCard
	} from '@upwell/docs-ui/symbol-card';
	import type { SourceCandidate } from '../../server/source.ts';
	import SourceCandidates from './SourceCandidates.svelte';

	interface Props {
		html: string;
		oninspect: (symbol: string) => void;
	}

	let { html, oninspect }: Props = $props();
	let active = $state<ActiveSymbolCard>();
	let ambiguous = $state<{ candidates: readonly SourceCandidate[]; anchor: HTMLElement }>();
	const id = $props.id();
	const symbolCardId = `symbol-card-${id}`;
	const symbolCards = createSourceSymbolCardInteractions({
		panelId: symbolCardId,
		onChange: (next) => {
			active = next;
		}
	});

	function choose(event: MouseEvent): void {
		const ambiguousTarget = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-candidates]');

		if (ambiguousTarget?.dataset.candidates) {
			event.preventDefault();

			try {
				ambiguous = { candidates: JSON.parse(ambiguousTarget.dataset.candidates) as SourceCandidate[], anchor: ambiguousTarget };
			} catch {
				ambiguous = undefined;
			}

			return;
		}

		if (!event.metaKey && !event.ctrlKey) return;
		const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-symbol]:not([data-external])');

		if (target?.dataset.symbol) {
			event.preventDefault();
			oninspect(target.dataset.symbol);
		}
	}

	const sourceInteractions: Attachment<HTMLElement> = (node) => {
		const detachSymbolCards = symbolCards.targets(node);

		node.addEventListener('click', choose);

		return () => {
			node.removeEventListener('click', choose);
			detachSymbolCards?.();
		};
	};

	function dismiss(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			symbolCards.dismiss(true);
		}
	}
</script>

<svelte:window onkeydown={dismiss} />

<div class="code" {@attach sourceInteractions}>
	<!-- Server-rendered by Shiki; source is escaped and only trusted annotation attributes are added. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html html}
</div>

{#if active}
	<SymbolCard id={symbolCardId} data={active.data} anchor={active.anchor} interaction={symbolCards.card} />
{/if}

{#if ambiguous}
	<SourceCandidates candidates={ambiguous.candidates} anchor={ambiguous.anchor} onclose={() => { ambiguous = undefined; }} />
{/if}

<style>
	.code { min-height: 0; overflow: auto; background: var(--surface-sunken); }
	.code :global(pre) { min-width: max-content; min-height: 100%; margin: 0; padding: 0.75rem 0; font-family: var(--font-mono); font-size: 0.78rem; line-height: normal; tab-size: 2; }
	.code :global(:where(code, span)) { color: var(--shiki-light); }
	.code :global(.line) { display: block; padding: 0 2rem 0 3.6rem; }
	.code :global(.line)::before { content: attr(data-line); display: inline-block; width: 2.8rem; margin-left: -3.6rem; padding-right: 0.8rem; color: var(--text-subtle); text-align: right; user-select: none; }
	.code :global(.line:target) { background: color-mix(in srgb, var(--accent) 12%, transparent); }
	.code :global(.symbol) { border-bottom: 1px dotted color-mix(in srgb, currentColor 45%, transparent); cursor: pointer; text-decoration: none; }
	.code :global(.symbol[data-lens='type']) { color: var(--lens-type) !important; }
	.code :global(.symbol[data-lens='callable']) { color: var(--lens-callable) !important; }
	.code :global(.symbol[data-lens='macro']) { color: var(--lens-macro) !important; }
	.code :global(.symbol[data-lens='value']) { color: var(--lens-value) !important; }
	.code :global(.symbol[data-lens='module']) { color: var(--lens-module) !important; }
	.code :global(.symbol[data-lens='field']) { color: inherit !important; }
	.code :global(.symbol:hover) { border-bottom-style: solid; }
	.code :global(.external) { border-bottom: 1px dotted color-mix(in srgb, currentColor 45%, transparent); text-decoration: none; }
	.code :global(.ambiguous) { border-bottom: 1px dashed var(--tone-warning); color: var(--tone-warning) !important; cursor: help; text-decoration: none; }
	@media (prefers-color-scheme: dark) { .code :global(:where(code, span)) { color: var(--shiki-dark); } }
</style>
