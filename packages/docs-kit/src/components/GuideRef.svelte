<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	import { guideFragment, guideSlug } from '@upwell/docs-core/references';
	import { getDocsAuthoringContext } from '../authoring-context.svelte.ts';

	type Props = Omit<HTMLAnchorAttributes, 'children' | 'href'> & {
		/** Guide slug relative to the active documentation release. */
		slug: string;
		/** Heading id within the guide, with or without a leading `#`. */
		fragment?: string;
		/** Link content. Defaults to the normalized slug. */
		children?: Snippet;
	};

	let { slug, fragment, children, ...attributes }: Props = $props();

	const context = getDocsAuthoringContext();
	const normalized = $derived(guideSlug(slug));
	const normalizedFragment = $derived(fragment === undefined ? undefined : guideFragment(fragment));
	const href = $derived(`${context.guideHref(normalized)}${normalizedFragment ? `#${normalizedFragment}` : ''}`);
</script>

<a {...attributes} {href}>
	{#if children}
		{@render children()}
	{:else}
		{normalized || 'Documentation'}
	{/if}
</a>
