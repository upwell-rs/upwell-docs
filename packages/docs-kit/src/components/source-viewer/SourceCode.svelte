<script lang="ts">
	import { SymbolCard, type SymbolCardData } from '@upwell/docs-ui';

	interface Props {
		html: string;
		oninspect: (symbol: string) => void;
	}

	let { html, oninspect }: Props = $props();
	let active = $state<{ data: SymbolCardData; anchor: HTMLElement }>();
	let card = $state<HTMLElement>();
	let closing: ReturnType<typeof setTimeout> | undefined;

	function choose(event: MouseEvent): void {
		if (!event.metaKey && !event.ctrlKey) return;
		const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-symbol]:not([data-external])');

		if (target?.dataset.symbol) {
			event.preventDefault();
			oninspect(target.dataset.symbol);
		}
	}

	function symbolInteractions(node: HTMLElement): { destroy(): void } {
		node.addEventListener('click', choose);
		node.addEventListener('mouseover', open);
		node.addEventListener('mouseout', leave);
		node.addEventListener('focusin', open);
		node.addEventListener('focusout', leave);

		return { destroy: () => {
			node.removeEventListener('click', choose);
			node.removeEventListener('mouseover', open);
			node.removeEventListener('mouseout', leave);
			node.removeEventListener('focusin', open);
			node.removeEventListener('focusout', leave);
		} };
	}

	function open(event: Event): void {
		const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-symbol], [data-external]');

		if (!target) return;
		clearTimeout(closing);
		const external = target.dataset.external;
		const path = external ?? target.dataset.symbol;

		if (!path) return;
		active = {
			anchor: target,
			data: external ? {
				path,
				kind: target.dataset.externalKind ?? 'item',
				externalCrate: target.dataset.externalCrate,
				summary: target.dataset.externalDoc,
				signature: target.dataset.externalSignature,
				sourceHref: target.getAttribute('href') ?? undefined
			} : {
				path,
				kind: target.dataset.symbolKind ?? 'item',
				signature: target.dataset.symbolSignature,
				summary: target.dataset.symbolDoc,
				feature: target.dataset.symbolFeature,
				deprecated: target.dataset.symbolDeprecated,
				sourceHref: target.dataset.symbolSource,
				documentedAt: target.dataset.symbolDocs ? { href: target.dataset.symbolDocs, title: target.dataset.symbolDocsTitle ?? 'Documentation' } : undefined
			}
		};
	}

	function leave(event: Event): void {
		if ((event.target as HTMLElement | null)?.closest('[data-symbol], [data-external]')) {
			closing = setTimeout(() => { active = undefined; }, 160);
		}
	}

	$effect(() => {
		if (!card) return;
		const keep = () => clearTimeout(closing);
		const close = () => { closing = setTimeout(() => { active = undefined; }, 160); };
		card.addEventListener('mouseenter', keep);
		card.addEventListener('mouseleave', close);

		return () => {
			card?.removeEventListener('mouseenter', keep);
			card?.removeEventListener('mouseleave', close);
		};
	});
</script>

<div class="code" use:symbolInteractions>
	<!-- Server-rendered by Shiki; source is escaped and only trusted annotation attributes are added. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html html}
</div>

{#if active}
	<SymbolCard bind:element={card} data={active.data} anchor={active.anchor} />
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
	@media (prefers-color-scheme: dark) { .code :global(:where(code, span)) { color: var(--shiki-dark); } }
</style>
