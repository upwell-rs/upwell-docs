<script lang="ts">
	import type { Snippet } from 'svelte';

	import { setDocsNotifier, setDocsVersion } from '@upwell/docs-ui/context';
	import type { SearchIndex } from '@upwell/docs-ui/search';
	import { Breadcrumbs, DocsArticle, DocsHeader, MobileNav, Notifications, PageNav, ReferenceNote, Search, Shortcuts, TableOfContents } from '@upwell/docs-ui';
	import type { DocsVersion } from '@upwell/docs-core/config';
	import type { DocSummary, PageChrome } from '@upwell/docs-core/content';

	import type { DocsContent } from '../content.ts';
	import { setDocsAuthoringContext } from '../authoring-context.svelte.ts';
	import { type DocsNotifier, type NotificationRuntime, type SidebarState } from '../client.svelte.ts';
	import DocsSidebar from './DocsSidebar.svelte';

	interface Props {
		content: DocsContent;
		version: DocsVersion;
		pathname: string;
		chrome?: PageChrome;
		previous?: DocSummary;
		next?: DocSummary;
		searchIndex: SearchIndex;
		sidebar: SidebarState;
		notifications: NotificationRuntime;
		navigate: (href: string, external?: boolean) => void;
		assignLocation: (href: string) => void;
		children: Snippet;
	}

	let { content, version, pathname, chrome: current, previous, next, searchIndex, sidebar, notifications, navigate, assignLocation, children }: Props = $props();

	let article = $state<HTMLElement>();
	let search = $state<ReturnType<typeof Search>>();

	setDocsVersion(() => version);
	setDocsNotifier((() => notifications.notifier)() as DocsNotifier);
	setDocsAuthoringContext({
		defaultCrate: (() => content.config.framework.crate)(),
		version: () => version
	});

	const slug = $derived(current?.slug ?? '');

	function changeVersion(id: string): void {
		const target = content.config.versions.find((candidate) => candidate.id === id);

		if (!target) {
			return;
		}

		const available = slug.startsWith('symbols/')
			? Boolean(content.findSymbolPage(slug.slice('symbols/'.length), target.releaseVersion))
			: Boolean(content.findPage(slug, target.releaseVersion));

		assignLocation(content.pageHref(target.id, available ? slug : content.config.landingSlug));
	}
</script>

<DocsHeader
	{version}
	name={content.config.framework.name}
	repository={content.config.framework.repository}
	versions={content.config.versions}
	onversionchange={changeVersion}
	onsearch={() => search?.open()}
>
	{#snippet nav()}
		<MobileNav title={version.label} {pathname}>
			{#snippet navigation()}
				<DocsSidebar {content} {version} current={slug} state={sidebar} />
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
	searchHref={(id) => `${content.pageHref(id, '')}/search.json`}
	{navigate}
/>
<Notifications requested={notifications.toaster.requested} />

<div class="layout">
	<aside class="layout__sidebar">
		<DocsSidebar {content} {version} current={slug} state={sidebar} />
	</aside>

	<main class="layout__main">
		{#if current}
			<Breadcrumbs {version} section={current.section} title={current.title} />
		{/if}

		<DocsArticle bind:element={article}>
			{@render children()}
		</DocsArticle>

		{#if current?.reference}
			<ReferenceNote backTo={{ href: content.pageHref(version.id, ''), title: 'Back to the guides' }} />
		{:else}
			<PageNav {version} {previous} {next} />
		{/if}
	</main>

	<aside class="layout__toc">
		<TableOfContents {article} key={pathname} />
	</aside>
</div>

<style>
	.layout { display: grid; grid-template-columns: 1fr; gap: 2rem; max-width: 90rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
	@media (min-width: 48rem) { .layout { padding: 2rem 1.5rem 4rem; } }
	.layout__main { min-width: 0; }
	.layout__sidebar, .layout__toc { display: none; }
	@media (min-width: 60rem) {
		.layout { grid-template-columns: 15rem minmax(0, 1fr); }
		.layout__sidebar { display: block; position: sticky; top: 5rem; align-self: start; max-height: calc(100vh - 7rem); overflow-y: auto; }
	}
	@media (min-width: 80rem) {
		.layout { grid-template-columns: 15rem minmax(0, 1fr) 14rem; }
		.layout__toc { display: block; position: sticky; top: 5rem; align-self: start; max-height: calc(100vh - 7rem); overflow-y: auto; }
	}
</style>
