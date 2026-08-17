<!--
	Where the current page sits: release, then section, then page.

	The section is not a link, because sections are sidebar groupings rather than pages. Rendering it
	as one would promise a destination that does not exist.
-->
<script lang="ts">
	import type { DocsVersion } from '../types.ts';

	interface Props {
		version: DocsVersion;
		section: string;
		title: string;
	}

	let { version, section, title }: Props = $props();
</script>

<nav class="crumbs" aria-label="Breadcrumb">
	<ol class="crumbs__list">
		<li><a href="/docs/{version.id}">Docs {version.label}</a></li>
		<li aria-hidden="true">/</li>
		<li>{section}</li>
		<li aria-hidden="true">/</li>
		<li aria-current="page">{title}</li>
	</ol>
</nav>

<style>
	.crumbs {
		margin-bottom: 0.75rem;
		font-size: 0.8125rem;
	}

	.crumbs__list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--text-subtle);
	}

	.crumbs__list a {
		color: var(--text-muted);
		text-decoration: none;
	}

	.crumbs__list a:hover {
		color: var(--text);
	}
</style>
