<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { DocsShell } from '@upwell/docs-kit/components';
	import type { DocSummary, PageChrome } from '@upwell/docs-core/content';

	import { docsClient, docsContent } from '#lib/docs/runtime';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const chrome = $derived(page.data.chrome as PageChrome | undefined);
	const previous = $derived(page.data.previous as DocSummary | undefined);
	const next = $derived(page.data.next as DocSummary | undefined);
	const symbolRecords = $derived(page.data.records);

	function navigate(href: string, external = false): void {
		if (external) {
			window.location.href = href;
			return;
		}

		void goto(href);
	}
</script>

<DocsShell
	content={docsContent}
	version={data.version}
	pathname={page.url.pathname}
	{chrome}
	{previous}
	{next}
	{symbolRecords}
	searchIndex={docsClient.searchIndex}
	sidebar={docsClient.sidebar}
	notifications={docsClient.notifications}
	{navigate}
	assignLocation={(href) => { window.location.href = href; }}
>
	{@render children()}
</DocsShell>
