<!--
	The documentation shell: header, sidebar, article, table of contents, page navigation.

	This is a SvelteKit layout rather than a component each page renders, and that is a behavioural
	choice, not a tidiness one: a layout is **not remounted** when navigating between pages that
	share it. The sidebar therefore keeps its scroll position and its collapsed groups across
	navigations, instead of resetting every time a link is followed.

	It owns the article element too, so the table of contents can read the rendered headings without
	the page having to hand them upward.
-->
<script lang="ts">
	import { page } from '$app/state';

	import Breadcrumbs from '#lib/docs/components/Breadcrumbs.svelte';
	import DocsArticle from '#lib/docs/components/DocsArticle.svelte';
	import DocsHeader from '#lib/docs/components/DocsHeader.svelte';
	import DocsSidebar from '#lib/docs/components/DocsSidebar.svelte';
	import MobileNav from '#lib/docs/components/MobileNav.svelte';
	import Notifications from '#lib/docs/components/Notifications.svelte';
	import PageNav from '#lib/docs/components/PageNav.svelte';
	import ReferenceNote from '#lib/docs/components/ReferenceNote.svelte';
	import Search from '#lib/docs/components/Search.svelte';
	import Shortcuts from '#lib/docs/components/Shortcuts.svelte';
	import TableOfContents from '#lib/docs/components/TableOfContents.svelte';
	import type { DocSummary, PageChrome } from '#lib/docs/content/types';
	import { setDocsVersion } from '#lib/docs/version.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let article = $state<HTMLElement>();
	let search = $state<ReturnType<typeof Search>>();

	setDocsVersion(() => data.version);

	/**
	 * Page-specific chrome, read from the merged page data.
	 *
	 * A layout cannot be handed props by the page below it, but `page.data` is the merge of every
	 * load in the chain — so the breadcrumb and pagination read what the current page returned
	 * without each page re-rendering the shell to supply it.
	 */
	const current = $derived(page.data.chrome as PageChrome | undefined);
	const previous = $derived(page.data.previous as DocSummary | undefined);
	const next = $derived(page.data.next as DocSummary | undefined);

	const slug = $derived(current?.slug ?? '');
</script>

	<DocsHeader version={data.version} {slug} onsearch={() => search?.open()}>
	{#snippet nav()}
		<MobileNav version={data.version} current={slug} {article} />
	{/snippet}
</DocsHeader>

<Shortcuts version={data.version} {previous} {next} onsearch={() => search?.open()} />
<Search bind:this={search} version={data.version} />
<Notifications />

<div class="layout">
	<aside class="layout__sidebar">
		<DocsSidebar version={data.version} current={slug} />
	</aside>

	<main class="layout__main">
		{#if current}
			<Breadcrumbs version={data.version} section={current.section} title={current.title} />
		{/if}

		<DocsArticle bind:element={article}>
			{@render children()}
		</DocsArticle>

		{#if current?.reference}
			<ReferenceNote backTo={{ href: `/docs/${data.version.id}`, title: 'Back to the guides' }} />
		{:else}
			<PageNav version={data.version} {previous} {next} />
		{/if}
	</main>

	<aside class="layout__toc">
		<TableOfContents {article} key={page.url.pathname} />
	</aside>
</div>

<style>
	.layout {
		display: grid;
		grid-template-columns: 1fr;
		gap: 2rem;
		max-width: 90rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 3rem;
	}

	@media (min-width: 48rem) {
		.layout {
			padding: 2rem 1.5rem 4rem;
		}
	}

	.layout__main {
		min-width: 0;
	}

	.layout__sidebar,
	.layout__toc {
		display: none;
	}

	@media (min-width: 60rem) {
		.layout {
			grid-template-columns: 15rem minmax(0, 1fr);
		}

		.layout__sidebar {
			display: block;
			position: sticky;
			top: 5rem;
			align-self: start;
			max-height: calc(100vh - 7rem);
			overflow-y: auto;
		}
	}

	@media (min-width: 80rem) {
		.layout {
			grid-template-columns: 15rem minmax(0, 1fr) 14rem;
		}

		.layout__toc {
			display: block;
			position: sticky;
			top: 5rem;
			align-self: start;
			max-height: calc(100vh - 7rem);
			overflow-y: auto;
		}
	}
</style>
