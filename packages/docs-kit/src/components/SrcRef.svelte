<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	import { sourceCrate, sourcePath } from '@upwell/docs-core/references';
	import { getDocsAuthoringContext } from '../authoring-context.svelte.ts';

	type Props = Omit<HTMLAnchorAttributes, 'children' | 'href'> & {
		/** Repository-relative file or directory path. */
		path: string;
		/** Documentation source crate. Defaults to the framework root crate. */
		source?: string;
		/** Configured source version id. Defaults to the active, corresponding, or latest source release. */
		version?: string;
		/** Link content. Defaults to the normalized source path. */
		children?: Snippet;
	};

	let { path, source, version, children, ...attributes }: Props = $props();

	const context = getDocsAuthoringContext();
	const normalizedPath = $derived(sourcePath(path));
	const normalizedSource = $derived(source === undefined ? undefined : sourceCrate(source));
	const href = $derived(context.sourceHref(normalizedPath, normalizedSource, version));
</script>

<a {...attributes} {href}>
	{#if children}
		{@render children()}
	{:else}
		{normalizedPath || 'Source'}
	{/if}
</a>
