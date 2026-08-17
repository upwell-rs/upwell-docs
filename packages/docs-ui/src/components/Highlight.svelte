<!--
	A string with the matched parts of a search query emphasised.

	The ranges come from the matcher that scored the result, not from a second search over the text.
	That is the whole reason this takes ranges rather than a query: re-finding the match here could
	disagree with what was actually scored — highlighting one occurrence while the result was ranked
	on another — and a highlight that points somewhere other than the reason for the match is worse
	than none.

	Rendered through Svelte's own escaping rather than `{@html}`, so a symbol name containing angle
	brackets is text and never markup.
-->
<script lang="ts">
	import { type MatchRanges, segments } from '../search/match.ts';

	interface Props {
		text: string;
		ranges?: MatchRanges;
	}

	let { text, ranges }: Props = $props();

	const pieces = $derived(ranges && ranges.length > 0 ? segments(text, ranges) : [{ text, match: false }]);
</script>

{#each pieces as piece, index (index)}{#if piece.match}<mark>{piece.text}</mark>{:else}{piece.text}{/if}{/each}

<style>
	/*
	 * A weight and colour change rather than a highlighter-pen background: the results list is dense,
	 * and a filled background on fragments of every row turns it into stripes.
	 */
	mark {
		background: none;
		color: var(--accent);
		font-weight: 600;
	}
</style>
