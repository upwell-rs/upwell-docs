<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { setDocsNotifier, setDocsVersion } from '@upwell/docs-ui/context';
	import { DocsHeader, MobileNav, Notifications, ReleaseSelect, Search, Shortcuts } from '@upwell/docs-ui';
	import type { DocSummary } from '@upwell/docs-core/content';
	import { docsVersions, frameworkCrate, type DocsSource, type DocsVersion } from '@upwell/docs-core/config';
	import { untrack, type Snippet } from 'svelte';

	import { setDocsAuthoringContext } from '../../../../packages/docs-kit/src/authoring-context.svelte.ts';
	import { resolveAuthoringReferenceTarget, resolveVersionNavigationTarget } from '../../../../packages/docs-kit/src/components/docs-shell/navigation.ts';
	import DocsSidebar from '../../../../packages/docs-kit/src/components/DocsSidebar.svelte';
	import SymbolsSidebar from '../../../../packages/docs-kit/src/components/SymbolsSidebar.svelte';
	import SkipLink from '../../../../packages/docs-kit/src/components/SkipLink.svelte';
	import type { DocsContent } from '../../../../packages/docs-kit/src/content.ts';
	import type { DocsNotifier, NotificationRuntime, SidebarState } from '../../../../packages/docs-kit/src/client.svelte.ts';
	import type { SymbolRecord } from '../../../../packages/docs-kit/src/sveltekit-server.ts';
	import type { SearchIndex } from '@upwell/docs-ui/search';

	interface Props {
		content: DocsContent;
		searchIndex: SearchIndex;
		sidebar: SidebarState;
		notifications: NotificationRuntime;
		children: Snippet;
	}

	let { content, searchIndex, sidebar, notifications, children }: Props = $props();
	let search = $state<ReturnType<typeof Search>>();

	const area = $derived(page.data.area as 'guide' | 'symbols' | 'source');
	const version = $derived(page.data.version as DocsVersion);
	const source = $derived((page.data.source as DocsSource | undefined) ?? { crate: content.config.framework.root.crate, repository: content.config.framework.root.repository });
	const versions = $derived((page.data.versions as readonly DocsVersion[] | undefined) ?? docsVersions(content.config));
	const chrome = $derived(page.data.chrome as { slug: string } | undefined);
	const previous = $derived(page.data.previous as DocSummary | undefined);
	const next = $derived(page.data.next as DocSummary | undefined);
	const records = $derived((page.data.records as readonly SymbolRecord[] | undefined) ?? []);
	const activeSource = $derived(frameworkCrate(content.config, source.crate) ?? content.config.framework.root);
	const symbolsHref = $derived(content.symbolHref(source.crate, version.id, '').replace(/\/$/, ''));
	const sourceHref = $derived(content.sourceHref(source.crate, version.id, ''));

	setDocsVersion(() => version);
	setDocsNotifier((() => notifications.notifier)() as DocsNotifier);
	setDocsAuthoringContext({
		defaultCrate: untrack(() => content.config.framework.root.crate),
		version: () => version,
		guideHref: (slug) => content.pageHref(reference().version.id, slug),
		symbolHref: (path, requestedSource, requestedVersion) => {
			const target = reference(requestedSource, requestedVersion);
			return content.symbolHref(target.source.crate, target.version.id, path);
		},
		sourceHref: (path, requestedSource, requestedVersion) => {
			const target = reference(requestedSource, requestedVersion);
			return content.sourceHref(target.source.crate, target.version.id, path);
		}
	});

	function reference(requestedSource?: string, requestedVersion?: string) {
		return resolveAuthoringReferenceTarget({
			config: content.config,
			source: requestedSource,
			version: requestedVersion,
			activeSource: source.crate,
			activeVersion: version
		});
	}

	function navigate(href: string, external = false): void {
		if (external) {
			window.location.href = href;
			return;
		}

		void goto(href);
	}

	function changeVersion(id: string): void {
		const target = resolveVersionNavigationTarget({
			content,
			activeSource,
			slug: chrome?.slug ?? '',
			versions,
			targetVersionId: id
		});

		if (target) {
			window.location.assign(target);
		}
	}
</script>

<SkipLink />
<div class:app-frame--source={area === 'source'} class="app-frame">
	<DocsHeader {version} name={content.config.framework.name} repository={source.repository} {versions} guidesHref={content.pageHref(version.id, content.config.landingSlug)} symbolsHref={symbolsHref} {sourceHref} area={area === 'guide' ? 'guides' : area} onversionchange={changeVersion} onsearch={() => search?.open()}>
		{#snippet nav()}
			<MobileNav title={version.label} pathname={page.url.pathname}>
				{#snippet controls(close)}
					<button class="menu-search" type="button" onclick={() => { close(); search?.open(); }}>Search</button>
					<ReleaseSelect id="docs-version-menu" {version} {versions} onversionchange={changeVersion} />
				{/snippet}
				{#snippet navigation()}
					{#if area === 'symbols'}
						<SymbolsSidebar {records} current={chrome?.slug ?? 'symbols'} indexHref={symbolsHref} state={sidebar} />
					{:else}
						<DocsSidebar {content} {version} current={chrome?.slug ?? ''} state={sidebar} />
					{/if}
				{/snippet}
				{#snippet toc()}{/snippet}
			</MobileNav>
		{/snippet}
	</DocsHeader>
	{@render children()}
</div>
<Shortcuts {previous} {next} homeHref={content.pageHref(version.id, '')} pageHref={(slug) => content.pageHref(version.id, slug)} {navigate} onsearch={() => search?.open()} />
<Search bind:this={search} {version} {searchIndex} searchHref={(id) => content.pageHref(id, 'search.json')} {navigate} />
<Notifications requested={notifications.toaster.requested} />

<style>
	.app-frame--source { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100dvh; overflow: hidden; }
	.menu-search { padding: 0.35rem 0.75rem; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); background: var(--surface-raised); color: var(--text); cursor: pointer; font: inherit; font-size: 0.875rem; }
	@media (min-width: 60rem) { .app-frame { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100dvh; overflow: hidden; } }
</style>
