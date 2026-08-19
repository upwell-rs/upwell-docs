<script lang="ts">
	import { page } from '$app/state';
	import { docsContent } from '#lib/docs/runtime';
	import { frameworkCrate, type DocsVersion } from '@upwell/docs-core/config';
	import type { Snippet } from 'svelte';

	import ReleaseNotice from '../../../../packages/docs-kit/src/components/ReleaseNotice.svelte';
	import { resolveReleaseNotice } from '../../../../packages/docs-kit/src/components/release-notice.ts';
	import { DOCS_MAIN_ID } from '../../../../packages/docs-kit/src/components/shell-a11y.ts';

	interface Props { children: Snippet; }
	let { children }: Props = $props();
	const source = $derived(page.data.source as { crate: string; repository: string });
	const version = $derived(page.data.version as DocsVersion);
	const chrome = $derived(page.data.chrome as { slug: string } | undefined);
	const activeSource = $derived(frameworkCrate(docsContent.config, source.crate) ?? docsContent.config.framework.root);
	const notice = $derived(resolveReleaseNotice({ content: docsContent, version, source: activeSource, slug: chrome?.slug ?? 'src/' }));
</script>

<main id={DOCS_MAIN_ID} class:source--notice={Boolean(notice)} class="source" tabindex="-1">
	<ReleaseNotice {notice} mode="source" />
	<div class="source__content">{@render children()}</div>
</main>

<style>
	.source { min-height: 0; height: 100%; overflow: hidden; }
	.source--notice { display: grid; grid-template-rows: auto minmax(0, 1fr); }
	.source__content { min-height: 0; height: 100%; overflow: hidden; }
	.source--notice .source__content { height: auto; }
</style>
