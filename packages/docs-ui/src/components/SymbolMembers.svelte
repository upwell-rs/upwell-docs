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
	import { getSymbolInfoAccessor } from '../context.ts';
	import type { SymbolMember } from '../types.ts';
	import SymbolMemberRow from './SymbolMemberRow.svelte';
	import { selectSymbolMembers } from './symbol-members.ts';

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

	const symbolInfo = getSymbolInfoAccessor();
	const symbol = $derived(symbolInfo());

	/**
	 * Anchor for the section, derived from its title.
	 *
	 * Not a fixed `members`: a page may place this component more than once — settings and methods,
	 * say — and two sections sharing an id gives the page two headings with the same anchor, which
	 * the table of contents cannot tell apart.
	 */
	const anchor = $derived(`members-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`);

	const members = $derived(selectSymbolMembers(symbol.members, { only, except, kinds }));
</script>

{#if members.length > 0}
	<section class="members">
		<h2 class="members__title" id={anchor}>{title}</h2>

		<ul class="members__list">
			{#each members as member (member.name)}
				<SymbolMemberRow {member} {anchor} />
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

</style>
