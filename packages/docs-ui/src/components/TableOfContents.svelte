<!--
	On-page navigation, read from the rendered article.

	Headings are given their ids at build time, so deep links work without JavaScript; this only reads
	them back to build a list and track which one is in view. Deriving the list from the DOM rather
	than from a build-time export keeps it honest — it lists exactly the headings a reader can see,
	including any a component rendered.
-->
<script lang="ts">
	import type { DocHeading } from '../types.ts';

	interface Props {
		/** The article element to read headings from. */
		article: HTMLElement | undefined;
		/**
		 * Changes when the reader navigates.
		 *
		 * The article element lives in the layout and survives navigation, so nothing about it tells
		 * this component the content changed. Depending on the path is what re-reads the headings.
		 */
		key: string;
	}

	let { article, key }: Props = $props();

	let headings = $state<DocHeading[]>([]);
	let activeId = $state<string>();

	$effect(() => {
		// Read so the effect re-runs on navigation, not only when the element itself changes.
		void key;

		if (!article) {
			headings = [];

			return;
		}

		const found = [...article.querySelectorAll<HTMLElement>('h2[id], h3[id]')];

		// A duplicate id is dropped rather than listed twice. Two headings can legitimately end up
		// sharing one — a page repeating a component, or simply two sections with the same name — and
		// a keyed list over them throws, which took down the whole page. The first wins, because it is
		// the one the anchor actually reaches.
		headings = found
			.filter((element, at) => found.findIndex((other) => other.id === element.id) === at)
			.map((element) => ({
				id: element.id,
				// The anchor link appended at build time is part of the heading; its `#` is not part of
				// the heading's text.
				text: element.textContent?.replace(/#$/, '').trim() ?? element.id,
				depth: element.tagName === 'H2' ? 2 : 3
			}));

		// `rootMargin` biases the intersection band towards the top of the viewport, so the entry
		// marked active is the one being read rather than the last one to scroll into view at all.
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.filter((entry) => entry.isIntersecting);

				if (visible.length > 0) {
					activeId = visible[0].target.id;
				}
			},
			{ rootMargin: '-80px 0px -70% 0px' }
		);

		for (const element of found) {
			observer.observe(element);
		}

		return () => observer.disconnect();
	});
</script>

{#if headings.length > 1}
	<nav class="toc" aria-label="On this page">
		<h2 class="toc__title">On this page</h2>
		<ul class="toc__list">
			{#each headings as heading (heading.id)}
				<li>
					<a
						class="toc__link"
						href="#{heading.id}"
						data-depth={heading.depth}
						aria-current={heading.id === activeId ? 'location' : undefined}
					>{heading.text}</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}

	<style>
		:global(html) {
			scroll-behavior: smooth;
		}

		@media (prefers-reduced-motion: reduce) {
			:global(html) {
				scroll-behavior: auto;
			}
		}

		.toc {
			font-size: 0.8125rem;
		}

	.toc__title {
		margin: 0 0 0.5rem;
		color: var(--text-subtle);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.toc__list {
		margin: 0;
		padding: 0;
		list-style: none;
		border-left: 1px solid var(--border);
	}

	.toc__link {
		display: block;
		padding: 0.2rem 0 0.2rem 0.75rem;
		margin-left: -1px;
		border-left: 1px solid transparent;
		color: var(--text-muted);
		text-decoration: none;
	}

	.toc__link[data-depth='3'] {
		padding-left: 1.5rem;
	}

	.toc__link:hover {
		color: var(--text);
	}

	.toc__link[aria-current='location'] {
		border-left-color: var(--accent);
		color: var(--accent);
	}
</style>
