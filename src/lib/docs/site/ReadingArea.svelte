<script lang="ts">
	import { page } from '$app/state';
	import { Breadcrumbs, DocsArticle, PageNav, PaneResizer, ReferenceNote, TableOfContents } from '@upwell/docs-ui';
	import type { DocSummary, PageChrome } from '@upwell/docs-core/content';
	import { frameworkCrate, type DocsVersion } from '@upwell/docs-core/config';
	import type { Snippet } from 'svelte';

	import type { DocsContent } from '../../../../packages/docs-kit/src/content.ts';
	import type { SidebarState } from '../../../../packages/docs-kit/src/client.svelte.ts';
	import DocsSidebar from '../../../../packages/docs-kit/src/components/DocsSidebar.svelte';
	import SymbolsSidebar from '../../../../packages/docs-kit/src/components/SymbolsSidebar.svelte';
	import ReleaseNotice from '../../../../packages/docs-kit/src/components/ReleaseNotice.svelte';
	import { resolveReleaseNotice } from '../../../../packages/docs-kit/src/components/release-notice.ts';
	import { observeSidebarMaximumWidth, resetReadingPaneOnNavigation } from './reading-area-lifecycle.svelte.ts';
	import { DOCS_MAIN_ID } from '../../../../packages/docs-kit/src/components/shell-a11y.ts';
	import type { SymbolRecord } from '../../../../packages/docs-kit/src/sveltekit-server.ts';

	interface Props {
		area: 'guide' | 'symbols';
		content: DocsContent;
		version: DocsVersion;
		sidebar: SidebarState;
		children: Snippet;
	}

	let { area, content, version, sidebar, children }: Props = $props();
	let article = $state<HTMLElement>();
	let sidebarMax = $state(420);

	const chrome = $derived(page.data.chrome as PageChrome | undefined);
	const previous = $derived(page.data.previous as DocSummary | undefined);
	const next = $derived(page.data.next as DocSummary | undefined);
	const records = $derived((page.data.records as readonly SymbolRecord[] | undefined) ?? []);
	const source = $derived(page.data.source as { crate: string; repository: string } | undefined);
	const slug = $derived(chrome?.slug ?? '');
	const sidebarArea = $derived(area === 'symbols' ? 'symbols' : 'guides');
	const sidebarWidth = $derived(Math.min(sidebar.width.get(sidebarArea), sidebarMax));
	const symbolsHref = $derived(content.symbolHref(source?.crate ?? content.config.framework.root.crate, version.id, '').replace(/\/$/, ''));
	const activeSource = $derived(frameworkCrate(content.config, source?.crate ?? content.config.framework.root.crate) ?? content.config.framework.root);
	const notice = $derived(resolveReleaseNotice({ content, version, source: activeSource, slug }));
</script>

<div {@attach observeSidebarMaximumWidth((width) => sidebarMax = width)} class="layout" style={`--sidebar-width: ${sidebarWidth}px`}>
	<aside class="layout__sidebar">
		{#if area === 'symbols'}
			<SymbolsSidebar {records} current={slug} indexHref={symbolsHref} state={sidebar} />
		{:else}
			<DocsSidebar {content} {version} current={slug} state={sidebar} />
		{/if}
	</aside>
	<div class="layout__resizer"><PaneResizer width={sidebarWidth} min={176} max={sidebarMax} defaultWidth={area === 'symbols' ? 300 : 280} label={area === 'symbols' ? 'Resize the reference navigation' : 'Resize the guide navigation'} onwidth={(width) => sidebar.width.set(sidebarArea, width)} /></div>
	<main id={DOCS_MAIN_ID} {@attach resetReadingPaneOnNavigation(() => page.url.pathname)} class="layout__main" tabindex="-1">
		<div class="layout__reading">
			<ReleaseNotice notice={notice} />
			{#if chrome}<Breadcrumbs {version} section={chrome.section} title={chrome.title} />{/if}
			<DocsArticle bind:element={article}>{@render children()}</DocsArticle>
			{#if chrome?.reference && slug !== 'symbols'}
				<ReferenceNote backTo={{ href: content.pageHref(version.id, ''), title: 'Back to the guides' }} />
			{:else}<PageNav {version} {previous} {next} />{/if}
		</div>
	</main>
	<aside class="layout__toc"><TableOfContents {article} key={page.url.pathname} /></aside>
</div>

<style>
	.layout { display: grid; grid-template-columns: 1fr; gap: 2rem; max-width: 90rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
	.layout__sidebar, .layout__toc, .layout__resizer { display: none; }
	.layout__main { min-width: 0; }
	@media (min-width: 48rem) { .layout { padding: 2rem 1.5rem 4rem; } }
	@media (min-width: 60rem) { .layout { box-sizing: border-box; grid-template-columns: var(--sidebar-width) 0.5rem minmax(0, 1fr); gap: 0; width: 100%; height: 100%; min-height: 0; max-width: none; margin: 0; padding: 0; overflow: hidden; } .layout__sidebar { box-sizing: border-box; display: block; min-width: 0; min-height: 0; height: 100%; padding: 1.5rem 1rem 3rem; overflow: hidden auto; overscroll-behavior: contain; scrollbar-gutter: stable; } .layout__resizer { display: block; height: 100%; } .layout__main { min-height: 0; height: 100%; overflow: hidden auto; overscroll-behavior: contain; scrollbar-gutter: stable; } .layout__reading { max-width: 54rem; margin: 0 auto; padding: 1.75rem 2rem 4rem; } }
	@media (min-width: 80rem) { .layout { grid-template-columns: var(--sidebar-width) 0.5rem minmax(0, 1fr) 14rem; } .layout__toc { box-sizing: border-box; display: block; min-height: 0; height: 100%; padding: 1.75rem 1rem 3rem; overflow: hidden auto; overscroll-behavior: contain; scrollbar-gutter: stable; } }
</style>
