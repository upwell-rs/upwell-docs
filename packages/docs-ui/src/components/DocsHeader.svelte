<!--
	Site header for the documentation area.

	Shows which release is being read, because a versioned documentation site that does not is
	actively misleading. The selector is a plain list of documented releases; `latest` never appears
	as a choice, since it is an alias that resolves to one of them.

-->
<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import type { DocsVersion } from '../types.ts';
	import ReleaseSelect from './ReleaseSelect.svelte';

	interface Props {
		version: DocsVersion;
		/** Opens the search dialog. */
		onsearch: () => void;
		name: string;
		repository: string;
		versions: readonly DocsVersion[];
		guidesHref: string;
		symbolsHref: string;
		sourceHref?: string;
		area: 'guides' | 'symbols' | 'source';
		onversionchange: (id: string) => void;
		/** The narrow-viewport navigation trigger, which hides itself on wide ones. */
		nav?: Snippet;
	}

	let { version, onsearch, name, repository, versions, guidesHref, symbolsHref, sourceHref, area, onversionchange, nav }: Props = $props();
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});
</script>

<header class="header" data-hydrated={hydrated || undefined}>
	{#if nav}{@render nav()}{/if}

		<a class="header__brand" href="/">{name}</a>

		<nav class="header__areas" aria-label="Documentation sections">
			<a href={guidesHref} aria-current={area === 'guides' ? 'page' : undefined}>Guides</a>
			<a href={symbolsHref} aria-current={area === 'symbols' ? 'page' : undefined}>Symbols</a>
			{#if sourceHref}<a href={sourceHref} aria-current={area === 'source' ? 'page' : undefined}>Source</a>{/if}
		</nav>

		<button class="header__search" type="button" onclick={onsearch}>
		<span>Search</span>
		<kbd class="header__key">/</kbd>
	</button>

	<div class="header__nav">
		<ReleaseSelect {version} {versions} {onversionchange} />
	</div>

		<a class="header__repo" href={repository} rel="noreferrer">Repository</a>
</header>

<style>
	.header {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		height: 3.5rem;
		padding: 0 0.875rem;
		border-bottom: 1px solid var(--border);
		background: color-mix(in srgb, var(--surface) 85%, transparent);
		backdrop-filter: blur(8px);
	}

	/* Narrow layouts scroll the document, so their navigation remains attached to that scroller. */
	@media (max-width: 59.999rem) {
		.header {
			position: sticky;
			top: 0;
			z-index: 20;
			background: color-mix(in srgb, var(--surface) 92%, transparent);
		}
	}

	@media (min-width: 40rem) {
		.header {
			gap: 1rem;
			padding: 0 1.5rem;
		}
	}

	.header__brand {
		color: var(--text);
		font-weight: 600;
		letter-spacing: -0.01em;
		text-decoration: none;
	}

	.header__search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) - 2px);
		background: var(--surface-raised);
		color: var(--text-subtle);
		cursor: pointer;
		font: inherit;
		font-size: 0.8125rem;
	}

	.header__areas {
		display: flex;
		align-self: stretch;
		gap: 0.25rem;
	}

	.header__areas a {
		display: flex;
		align-items: center;
		padding: 0 0.55rem;
		border-bottom: 2px solid transparent;
		color: var(--text-muted);
		font-size: 0.8125rem;
		text-decoration: none;
	}

	.header__areas a:hover {
		color: var(--text);
	}

	.header__areas a[aria-current='page'] {
		border-bottom-color: var(--accent);
		color: var(--text);
	}

	.header__search:hover {
		color: var(--text);
	}

	/*
	 * Chrome that a narrow header cannot afford.
	 *
	 * The shortcut hint is for a keyboard the reader does not have, and the repository link is a
	 * destination away from the documentation. Search and the release selector are not dropped, only
	 * moved: the menu button that replaces them carries both, because a phone that cannot search or
	 * change release has lost function rather than clutter.
	 */
	.header__key {
		display: none;
		padding: 0 0.3rem;
		border: 1px solid var(--border);
		border-radius: 3px;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
	}

	.header__nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	@media (min-width: 48rem) {
		.header__key {
			display: inline-block;
		}
	}

	@media (max-width: 30rem) {
		.header__search,
		.header__nav {
			display: none;
		}

		.header__areas a {
			padding: 0 0.35rem;
		}
	}

	.header__repo {
		display: none;
		color: var(--text-muted);
		font-size: 0.875rem;
		text-decoration: none;
	}

	@media (min-width: 48rem) {
		.header__repo {
			display: inline;
		}
	}

	.header__repo:hover {
		color: var(--text);
	}
</style>
