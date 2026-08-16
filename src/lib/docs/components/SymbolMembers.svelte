<!--
	The members of the documented symbol: methods, associated functions, constants and types.

	This is the part of a symbol page nobody should have to write by hand. The signatures and summaries
	all come from the build, so a page places this component once and the list stays correct through
	every release — where a hand-written table is wrong the first time a parameter changes and nobody
	notices for months.

	It is opt-in rather than automatic, and it takes a `only`/`except` filter, because a page about a
	type usually wants to explain three of its methods in prose and list the rest. Prose first, the
	exhaustive list after it, is the shape a good reference page has.

	Deliberately not collapsible per member: the browser's own find has to be able to reach a method
	name, and a closed `<details>` for each of forty members makes the page a worse reference than
	rustdoc, which is not the bar to aim at.
-->
<script lang="ts">
	import { getSymbolInfo, type SymbolMember } from '../symbol.svelte.ts';

	interface Props {
		/** Heading for the section. */
		title?: string;
		/** List only these members, in the order given. */
		only?: readonly string[];
		/** List every member except these — the ones the page already covers in prose. */
		except?: readonly string[];
		/** Show only these kinds, e.g. `['method']`. */
		kinds?: readonly SymbolMember['kind'][];
	}

	let { title = 'Members', only, except, kinds }: Props = $props();

	const symbol = getSymbolInfo();

	/**
	 * Anchor for the section, derived from its title.
	 *
	 * Not a fixed `members`: a page may place this component more than once — settings and methods,
	 * say — and two sections sharing an id gives the page two headings with the same anchor, which
	 * the table of contents cannot tell apart.
	 */
	const anchor = $derived(`members-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`);

	const members = $derived.by(() => {
		const excluded = new Set(except ?? []);
		const allowed = kinds ? new Set<string>(kinds) : undefined;
		const selected = symbol.members.filter(
			(member) => !excluded.has(member.name) && (!allowed || allowed.has(member.kind))
		);

		if (!only) {
			return selected;
		}

		// `only` states an order as well as a selection: a page listing three methods means those
		// three, in the order it named them, not whichever of them happened to sort first.
		return only.map((name) => selected.find((member) => member.name === name)).filter((member) => member !== undefined);
	});

	const KIND_LABEL: Record<string, string> = {
		method: 'method',
		assoc_fn: 'fn',
		assoc_const: 'const',
		assoc_type: 'type',
		struct_field: 'field',
		variant: 'variant'
	};
</script>

{#if members.length > 0}
	<section class="members">
		<h2 class="members__title" id={anchor}>{title}</h2>

		<ul class="members__list">
			{#each members as member (member.name)}
				<li class="member" id="{anchor}-{member.name}">
					<div class="member__head">
						<code class="member__name" class:member__name--deprecated={member.deprecated}>{member.name}</code>
						<span class="member__kind">{KIND_LABEL[member.kind] ?? member.kind}</span>
						{#if member.deprecated}
							<span class="member__deprecated">deprecated</span>
						{/if}
						{#if member.sourceHref}
							<a class="member__source" href={member.sourceHref} rel="noreferrer">source</a>
						{/if}
					</div>

					{#if member.signature}
						<pre class="member__signature"><code>{member.signature}</code></pre>
					{/if}

					{#if member.doc}
						<p class="member__doc">{member.doc}</p>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.members {
		margin: 2rem 0;
	}

	.members__title {
		margin: 0 0 0.75rem;
		font-size: 1.375rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		scroll-margin-top: 5rem;
	}

	.members__list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.member {
		padding: 0.75rem 0;
		border-top: 1px solid var(--border);
	}

	.member:last-child {
		border-bottom: 1px solid var(--border);
	}

	.member__head {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.member__name {
		background: none;
		padding: 0;
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.member__name--deprecated {
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, currentColor 50%, transparent);
	}

	.member__kind {
		color: var(--text-subtle);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.member__deprecated {
		color: var(--tone-warning);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.member__source {
		margin-left: auto;
		color: var(--text-subtle);
		font-size: 0.75rem;
		text-decoration: none;
	}

	.member__source:hover {
		color: var(--accent);
	}

	.member__signature {
		margin: 0.4rem 0 0;
		padding: 0.5rem 0.75rem;
		overflow-x: auto;
		border-radius: calc(var(--radius) - 2px);
		background: var(--surface-sunken);
		font-family: var(--font-mono);
		font-size: 0.78125rem;
		line-height: 1.6;
	}

	.member__doc {
		margin: 0.5rem 0 0;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
</style>
