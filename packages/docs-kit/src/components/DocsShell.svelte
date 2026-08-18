<script lang="ts">
	import type { Snippet } from 'svelte';

	import { setDocsNotifier, setDocsVersion } from '@upwell/docs-ui/context';
	import type { SearchIndex } from '@upwell/docs-ui/search';
	import { Breadcrumbs, DocsArticle, DocsHeader, MobileNav, Notifications, PageNav, ReferenceNote, Search, Shortcuts, TableOfContents } from '@upwell/docs-ui';
	import type { DocsSource, DocsVersion } from '@upwell/docs-core/config';
	import type { DocSummary, PageChrome } from '@upwell/docs-core/content';

	import type { DocsContent } from '../content.ts';
	import { setDocsAuthoringContext } from '../authoring-context.svelte.ts';
	import { type DocsNotifier, type NotificationRuntime, type SidebarState } from '../client.svelte.ts';
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
	let search = $state<ReturnType<typeof Search>>();

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

<div class:layout--source={sourceViewer} class="layout">
	<aside class="layout__sidebar" class:layout__sidebar--hidden={sourceViewer}>
		{#if symbols}
			<SymbolsSidebar records={symbolRecords} current={slug} indexHref={symbolsIndexHref} state={sidebar} />
		{:else}
			<DocsSidebar {content} {version} current={slug} state={sidebar} />
		{/if}
	</aside>

	<main class:layout__main--source={sourceViewer} class="layout__main">
		{#if current && !sourceViewer}
			<Breadcrumbs {version} section={current.section} title={current.title} />
		{/if}

		{#if sourceViewer}
			{@render children()}
		{:else}
			<DocsArticle bind:element={article}>
				{@render children()}
			</DocsArticle>
		{/if}

		{#if !sourceViewer && current?.reference && slug !== 'symbols'}
			<ReferenceNote backTo={{ href: content.pageHref(version.id, ''), title: 'Back to the guides' }} />
		{:else if !sourceViewer}
			<PageNav {version} {previous} {next} />
		{/if}
	</main>

	<aside class="layout__toc" class:layout__toc--hidden={sourceViewer}>
		<TableOfContents {article} key={pathname} />
	</aside>
</div>

<style>
	.layout { display: grid; grid-template-columns: 1fr; gap: 2rem; max-width: 90rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
	@media (min-width: 48rem) { .layout { padding: 2rem 1.5rem 4rem; } }
	.layout__main { min-width: 0; }
	.layout__sidebar, .layout__toc { display: none; }
	.layout--source { box-sizing: border-box; height: calc(100dvh - 3.5rem); max-width: none; margin: 0; padding: 0; overflow: hidden; }
	.layout__main--source { min-height: 0; height: 100%; overflow: hidden; }
	@media (min-width: 60rem) {
		.layout { grid-template-columns: 15rem minmax(0, 1fr); }
		.layout__sidebar { display: block; position: sticky; top: 5rem; align-self: start; max-height: calc(100vh - 7rem); overflow-y: auto; }
		.layout--source { grid-template-columns: minmax(0, 1fr); padding: 0; }
		.layout__sidebar--hidden { display: none; }
	}
	@media (min-width: 80rem) {
		.layout { grid-template-columns: 15rem minmax(0, 1fr) 14rem; }
		.layout__toc { display: block; position: sticky; top: 5rem; align-self: start; max-height: calc(100vh - 7rem); overflow-y: auto; }
		.layout--source { grid-template-columns: minmax(0, 1fr); padding: 0; }
		.layout__toc--hidden { display: none; }
	}
</style>
