<!--
	Navigation for viewports too narrow for the sidebar.

	Below 60rem the sidebar and the table of contents are not laid out at all, which left a phone with
	the header, the article, and no way to reach any other page — the site was readable but not
	navigable. This is that missing half.

	A `<dialog>` again, for the same reasons the search dialog is one: focus handling, Escape, and the
	top layer are all behaviour worth not reimplementing. It renders the same `DocsSidebar` the wide
	layout uses rather than a second navigation built from the same data, so a section added to one
	cannot go missing from the other.

	The table of contents is included, because on a narrow screen it is *more* useful than on a wide
	one: the article is a single long column with no persistent outline beside it.

	Closing on navigation is explicit. The layout survives navigation — that is the point of it being
	a layout — so nothing would otherwise dismiss the dialog, and the reader would arrive at the new
	page with the menu still covering it.
-->
<script lang="ts">
	import { page } from '$app/state';

	import type { DocsVersion } from '../config.ts';
	import DocsSidebar from './DocsSidebar.svelte';
	import TableOfContents from './TableOfContents.svelte';

	interface Props {
		version: DocsVersion;
		/** Slug of the page being read. */
		current: string;
		/** The rendered article, so the contents list can read its headings. */
		article: HTMLElement | undefined;
	}

	let { version, current, article }: Props = $props();

	let dialog = $state<HTMLDialogElement>();
	let open = $state(false);

	/**
	 * The path the menu was opened on. Deliberately **not** reactive.
	 *
	 * The effect below must depend on the pathname and nothing else. Reading a piece of `$state` that
	 * `show()` writes would make opening the menu re-run the effect, which then closed it again — the
	 * menu appeared and vanished in the same frame. A plain variable is invisible to the tracker,
	 * which is exactly what is wanted for a value the effect only compares against.
	 */
	let openedAt = '';

	function show(): void {
		dialog?.showModal();
		open = true;
		openedAt = page.url.pathname;
	}

	function close(): void {
		dialog?.close();
	}

	/**
	 * Dismisses the menu when the reader navigates.
	 *
	 * The layout survives navigation — that is the point of it being a layout — so nothing else would
	 * dismiss it, and the reader would arrive at the new page with the menu still covering it.
	 */
	$effect(() => {
		const path = page.url.pathname;

		if (openedAt !== '' && path !== openedAt) {
			openedAt = '';
			close();
		}
	});
</script>

<button class="trigger" type="button" onclick={show} aria-haspopup="dialog" aria-expanded={open}>
	<svg viewBox="0 0 16 16" aria-hidden="true">
		<path d="M2 4h12M2 8h12M2 12h12" />
	</svg>
	<span>Menu</span>
</button>

<dialog bind:this={dialog} class="menu" aria-label="Documentation navigation" onclose={() => (open = false)}>
	<div class="menu__bar">
		<span class="menu__title">{version.label}</span>
		<button class="menu__close" type="button" onclick={close} aria-label="Close navigation">
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
		</button>
	</div>

	<div class="menu__body">
		<DocsSidebar {version} {current} />

		<div class="menu__toc">
			<TableOfContents {article} key={page.url.pathname} />
		</div>
	</div>
</dialog>

<style>
	.trigger {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) - 2px);
		background: var(--surface-raised);
		color: var(--text-muted);
		cursor: pointer;
		font: inherit;
		font-size: 0.8125rem;
	}

	.trigger svg {
		width: 0.875rem;
		height: 0.875rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
	}

	/* The wide layout has a real sidebar, so the trigger has nothing to open. */
	@media (min-width: 60rem) {
		.trigger {
			display: none;
		}
	}

	/*
	 * A panel anchored to the left edge and full height, rather than a centred box: it is the sidebar
	 * that the viewport is too narrow to keep, and it reads as one.
	 */
	.menu {
		width: min(20rem, calc(100vw - 3rem));
		max-width: none;
		height: 100dvh;
		max-height: none;
		margin: 0 auto 0 0;
		padding: 0;
		border: none;
		border-right: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
	}

	.menu::backdrop {
		background: color-mix(in srgb, var(--shadow) 45%, transparent);
	}

	.menu__bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 3.5rem;
		padding: 0 0.75rem 0 1.25rem;
		border-bottom: 1px solid var(--border);
	}

	.menu__title {
		color: var(--text-subtle);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.menu__close {
		display: flex;
		padding: 0.4rem;
		border: none;
		border-radius: calc(var(--radius) - 2px);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.menu__close:hover {
		background: var(--surface-raised);
		color: var(--text);
	}

	.menu__close svg {
		width: 0.875rem;
		height: 0.875rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
	}

	.menu__body {
		height: calc(100dvh - 3.5rem);
		padding: 1.25rem;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.menu__toc {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
</style>
