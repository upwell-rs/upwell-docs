<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	import { setDocsNotifier, setDocsVersion } from '@upwell/docs-ui/context';
	import type { SearchIndex } from '@upwell/docs-ui/search';
	import { Breadcrumbs, DocsArticle, DocsHeader, MobileNav, Notifications, PageNav, PaneResizer, ReferenceNote, Search, Shortcuts, TableOfContents } from '@upwell/docs-ui';
	import type { DocsSource, DocsVersion } from '@upwell/docs-core/config';
	import type { DocSummary, PageChrome } from '@upwell/docs-core/content';

	import type { DocsContent } from '../content.ts';
	import { setDocsAuthoringContext } from '../authoring-context.svelte.ts';
	import {
			SIDEBAR_MAX_WIDTH,
			SIDEBAR_MIN_WIDTH,
			SIDEBAR_DEFAULT_WIDTH,
		type DocsNotifier,
		type NotificationRuntime,
		type SidebarArea,
		type SidebarState
	} from '../client.svelte.ts';
	import DocsSidebar from './DocsSidebar.svelte';
	import SymbolsSidebar from './SymbolsSidebar.svelte';
	import type { SymbolRecord } from '../sveltekit-server.ts';
	import { docsVersions } from '@upwell/docs-core/config';

	interface Props {
		content: DocsContent;
		version: DocsVersion;
		source?: DocsSource;
		versions?: readonly DocsVersion[];
		pathname: string;
		chrome?: PageChrome;
		previous?: DocSummary;
		next?: DocSummary;
		symbolRecords?: readonly SymbolRecord[];
		searchIndex: SearchIndex;
		sidebar: SidebarState;
		notifications: NotificationRuntime;
		navigate: (href: string, external?: boolean) => void;
		assignLocation: (href: string) => void;
		children: Snippet;
	}

	let { content, version, source, versions, pathname, chrome: current, previous, next, symbolRecords = [], searchIndex, sidebar, notifications, navigate, assignLocation, children }: Props = $props();

	let article = $state<HTMLElement>();
	let layout = $state<HTMLElement>();
	let main = $state<HTMLElement>();
	let search = $state<ReturnType<typeof Search>>();
	let sidebarMax = $state(SIDEBAR_MAX_WIDTH);

	setDocsVersion(() => version);
	setDocsNotifier((() => notifications.notifier)() as DocsNotifier);
	setDocsAuthoringContext({
		defaultCrate: (() => content.config.framework.root.crate)(),
		version: () => version
	});

	const slug = $derived(current?.slug ?? '');
	const symbols = $derived(slug === 'symbols' || slug.startsWith('symbols/'));
	const sourceViewer = $derived(slug.startsWith('src/'));
	const activeSource = $derived(source ?? content.config.framework.root);
	const availableVersions = $derived(versions ?? docsVersions(content.config));
	const symbolsIndexHref = $derived(content.symbolHref(activeSource.crate, version.id, '').replace(/\/$/, ''));
	const sourceHref = $derived(`/docs/${activeSource.crate}/${version.id}/src/`);
	const sidebarArea = $derived<SidebarArea>(symbols ? 'symbols' : 'guides');
	const sidebarWidth = $derived(Math.min(sidebar.width.get(sidebarArea), sidebarMax));

	onMount(() => {
		const minimumReadingWidth = 544;
		const updateSidebarMax = () => {
			if (!layout) {
				return;
			}

			const toc = layout.querySelector<HTMLElement>('.layout__toc');
			const resizer = layout.querySelector<HTMLElement>('.layout__resizer');
			const occupied = (toc?.offsetWidth ?? 0) + (resizer?.offsetWidth ?? 0);
			const available = layout.clientWidth - occupied - minimumReadingWidth;

			sidebarMax = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, available));
		};
		const observer = new ResizeObserver(updateSidebarMax);

		if (layout) {
			observer.observe(layout);
		}

		updateSidebarMax();

		return () => observer.disconnect();
	});

	/**
	 * Returns the reading pane to the top on navigation.
	 *
	 * Scroll restoration acts on the document, and past the layout's breakpoint the document does not
	 * scroll — the pane does. Without this a reader who follows a link from halfway down a page lands
	 * halfway down the next one. A URL carrying a fragment is left alone, because there the whole
	 * point of the navigation is to arrive somewhere other than the top.
	 */
	$effect(() => {
		void pathname;

		if (location.hash) {
			return;
		}

		main?.scrollTo({ top: 0 });
	});

	function changeVersion(id: string): void {
		const target = availableVersions.find((candidate) => candidate.id === id);

		if (!target) {
			return;
		}

		if (sourceViewer) {
			assignLocation(`/docs/${activeSource.crate}/${target.id}/${slug}`);

			return;
		}

		const available = slug === 'symbols' ? true : slug.startsWith('symbols/')
			? activeSource.crate !== content.config.framework.root.crate || Boolean(content.findSymbolPage(slug.slice('symbols/'.length), target.releaseVersion))
			: Boolean(content.findPage(slug, target.releaseVersion));

		assignLocation(symbols
			? content.symbolHref(activeSource.crate, target.id, available && slug.startsWith('symbols/') ? slug.slice('symbols/'.length) : '')
			: content.pageHref(target.id, available ? slug : content.config.landingSlug));
	}
</script>

<!--
	The shell is a two-row grid so the layout below the header measures itself against whatever is
	left of the viewport, rather than against a hardcoded copy of the header's height. Only these two
	elements may be its children: the overlays below render nothing in flow, but as grid items they
	would claim rows and break the split.
-->
<div class:shell--fixed={sourceViewer} class="shell">
	<DocsHeader
		{version}
		name={content.config.framework.name}
		repository={activeSource.repository}
		versions={availableVersions}
		guidesHref={content.pageHref(version.id, content.config.landingSlug)}
		symbolsHref={symbolsIndexHref}
		{sourceHref}
		area={sourceViewer ? 'source' : symbols ? 'symbols' : 'guides'}
		onversionchange={changeVersion}
		onsearch={() => search?.open()}
	>
		{#snippet nav()}
			<MobileNav title={version.label} {pathname}>
				{#snippet navigation()}
					{#if symbols}
						<SymbolsSidebar records={symbolRecords} current={slug} indexHref={symbolsIndexHref} state={sidebar} />
					{:else}
						<DocsSidebar {content} {version} current={slug} state={sidebar} />
					{/if}
				{/snippet}
				{#snippet toc()}
					<TableOfContents {article} key={pathname} />
				{/snippet}
			</MobileNav>
		{/snippet}
	</DocsHeader>

	<div bind:this={layout} class:layout--source={sourceViewer} class="layout" style={`--sidebar-width: ${sidebarWidth}px`}>
		<aside class="layout__sidebar" class:layout__sidebar--hidden={sourceViewer}>
			{#if symbols}
				<SymbolsSidebar records={symbolRecords} current={slug} indexHref={symbolsIndexHref} state={sidebar} />
			{:else}
				<DocsSidebar {content} {version} current={slug} state={sidebar} />
			{/if}
		</aside>

		{#if !sourceViewer}
			<div class="layout__resizer">
				<PaneResizer
					width={sidebarWidth}
					min={SIDEBAR_MIN_WIDTH}
					max={sidebarMax}
					defaultWidth={SIDEBAR_DEFAULT_WIDTH[sidebarArea]}
					label={symbols ? 'Resize the reference navigation' : 'Resize the guide navigation'}
					onwidth={(pixels) => sidebar.width.set(sidebarArea, pixels)}
				/>
			</div>
		{/if}

		<main bind:this={main} class:layout__main--source={sourceViewer} class="layout__main">
			{#if sourceViewer}
				{@render children()}
			{:else}
				<div class="layout__reading">
					{#if current}
						<Breadcrumbs {version} section={current.section} title={current.title} />
					{/if}

					<DocsArticle bind:element={article}>
						{@render children()}
					</DocsArticle>

					{#if current?.reference && slug !== 'symbols'}
						<ReferenceNote backTo={{ href: content.pageHref(version.id, ''), title: 'Back to the guides' }} />
					{:else}
						<PageNav {version} {previous} {next} />
					{/if}
				</div>
			{/if}
		</main>

		<aside class="layout__toc" class:layout__toc--hidden={sourceViewer}>
			<TableOfContents {article} key={pathname} />
		</aside>
	</div>
</div>

<Shortcuts
	{previous}
	{next}
	homeHref={content.pageHref(version.id, '')}
	pageHref={(pageSlug) => content.pageHref(version.id, pageSlug)}
	{navigate}
	onsearch={() => search?.open()}
/>
<Search
	bind:this={search}
	{version}
	{searchIndex}
	searchHref={(id) => content.pageHref(id, 'search.json')}
	{navigate}
/>
<Notifications requested={notifications.toaster.requested} />

<style>
	/*
	 * Narrow viewports keep the document scrolling.
	 *
	 * There is only one column to scroll down there, so pinning the viewport would buy nothing and
	 * cost the things a mobile browser does with a scrolling document: collapsing its address bar,
	 * and resizing without the layout fighting `dvh`. The pinned model starts at the same width the
	 * second column does, which is the width at which it begins to mean something.
	 */
	.layout { display: grid; grid-template-columns: 1fr; gap: 2rem; max-width: 90rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
	@media (min-width: 48rem) { .layout { padding: 2rem 1.5rem 4rem; } }
	.layout__main { min-width: 0; }
	.layout__sidebar, .layout__toc, .layout__resizer { display: none; }

	/* The source viewer is an application at every width, so it is pinned from the start. */
	.shell--fixed { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100dvh; overflow: hidden; }
	.layout--source { box-sizing: border-box; min-height: 0; height: 100%; max-width: none; margin: 0; padding: 0; overflow: hidden; }
	.layout__main--source { min-height: 0; height: 100%; overflow: hidden; }

	@media (min-width: 60rem) {
		/*
		 * Each pane scrolls itself rather than the page scrolling all of them.
		 *
		 * `minmax(0, 1fr)` and `min-height: 0` are both load-bearing: a track's default minimum is its
		 * content, so a wide code block or a long identifier would stretch the grid past the viewport
		 * instead of scrolling inside its own pane.
		 */
		.shell { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100dvh; overflow: hidden; }
		.layout { box-sizing: border-box; grid-template-columns: var(--sidebar-width) 0.5rem minmax(0, 1fr); gap: 0; width: 100%; height: 100%; min-height: 0; max-width: none; margin: 0; padding: 0; overflow: hidden; }
		.layout__sidebar { box-sizing: border-box; display: block; min-width: 0; min-height: 0; height: 100%; padding: 1.5rem 1rem 3rem; overflow: hidden auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
		.layout__resizer { display: block; height: 100%; }
		.layout__main { min-height: 0; height: 100%; overflow: hidden auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
		.layout__reading { max-width: 54rem; margin: 0 auto; padding: 1.75rem 2rem 4rem; }
		.layout--source { grid-template-columns: minmax(0, 1fr); }
		.layout__sidebar--hidden { display: none; }
	}

	@media (min-width: 80rem) {
		.layout { grid-template-columns: var(--sidebar-width) 0.5rem minmax(0, 1fr) 14rem; }
		.layout__toc { box-sizing: border-box; display: block; min-height: 0; height: 100%; padding: 1.75rem 1rem 3rem; overflow: hidden auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
		.layout--source { grid-template-columns: minmax(0, 1fr); }
		.layout__toc--hidden { display: none; }
	}
</style>
