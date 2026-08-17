<!--
	Site header for the documentation area.

	Shows which release is being read, because a versioned documentation site that does not is
	actively misleading. The selector is a plain list of documented releases; `latest` never appears
	as a choice, since it is an alias that resolves to one of them.

-->
<script lang="ts">
	import { docsConfig, type DocsVersion } from '../config.ts';
	import { findPage } from '../content/pages.ts';
	import { findSymbolPage } from '../content/symbol-pages.ts';

	import { onMount, type Snippet } from 'svelte';

	interface Props {
		version: DocsVersion;
		/** Slug of the page being read, kept when switching release. */
		slug: string;
		/** Opens the search dialog. */
		onsearch: () => void;
		/** The narrow-viewport navigation trigger, which hides itself on wide ones. */
		nav?: Snippet;
	}

	let { version, slug, onsearch, nav }: Props = $props();
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});
</script>

<header class="header" data-hydrated={hydrated || undefined}>
	{#if nav}{@render nav()}{/if}

	<a class="header__brand" href="/">{docsConfig.framework.name}</a>

	<button class="header__search" type="button" onclick={onsearch}>
		<span>Search</span>
		<kbd class="header__key">/</kbd>
	</button>

	<nav class="header__nav" aria-label="Release">
		<label class="header__label" for="docs-version">Release</label>
		<select
			id="docs-version"
			class="header__select"
			onchange={(event) => {
				const selected = event.currentTarget;
				const target = docsConfig.versions.find((candidate) => candidate.id === selected.value)!;
				const available = slug.startsWith('symbols/')
					? Boolean(findSymbolPage(slug.slice('symbols/'.length), target.releaseVersion))
					: Boolean(findPage(slug, target.releaseVersion));

				window.location.href = `/docs/${target.id}/${available ? slug : docsConfig.landingSlug}`;
			}}
		>
			{#each docsConfig.versions as option (option.id)}
				<option value={option.id} selected={option.id === version.id}>
					{option.label}
				</option>
			{/each}
		</select>
	</nav>

	<a class="header__repo" href={docsConfig.framework.repository} rel="noreferrer">Repository</a>
</header>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		height: 3.5rem;
		padding: 0 0.875rem;
		border-bottom: 1px solid var(--border);
		background: color-mix(in srgb, var(--surface) 85%, transparent);
		backdrop-filter: blur(8px);
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

	.header__search:hover {
		color: var(--text);
	}

	/*
	 * Chrome that a narrow header cannot afford.
	 *
	 * The shortcut hint is for a keyboard the reader does not have; the "Release" label repeats what
	 * the select already shows; the repository link is a destination away from the documentation. All
	 * three are the first things to go when four items compete for a phone's width — and dropping them
	 * is what leaves room for the menu button, which is the one thing a narrow screen cannot do
	 * without.
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

	.header__label {
		display: none;
		color: var(--text-subtle);
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	@media (min-width: 48rem) {
		.header__key,
		.header__label {
			display: inline-block;
		}
	}

	.header__select {
		padding: 0.2rem 0.4rem;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) - 2px);
		background: var(--surface-raised);
		color: var(--text);
		font: inherit;
		font-size: 0.8125rem;
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
