<script lang="ts">
	interface Props {
		label: string;
		resultsId: string;
		expanded: boolean;
		activeOptionId?: string;
		value?: string;
		oninput: () => void;
		onkeydown: (event: KeyboardEvent) => void;
	}

	let { label, resultsId, expanded, activeOptionId, value = $bindable(''), oninput, onkeydown }: Props = $props();
	let input = $state<HTMLInputElement>();

	function captureInput(element: HTMLInputElement): void {
		input = element;
	}

	export function focusAndSelect(): void {
		input?.focus();
		input?.select();
	}
</script>

<input
	{@attach captureInput}
	bind:value
	class="search__input"
	type="text"
	role="combobox"
	placeholder={label}
	aria-label={label}
	aria-autocomplete="list"
	aria-controls={resultsId}
	aria-expanded={expanded}
	aria-activedescendant={activeOptionId}
	autocomplete="off"
	spellcheck="false"
	{oninput}
	{onkeydown}
/>

<style>
	.search__input {
		padding: 0.875rem 1rem;
		border: none;
		border-bottom: 1px solid var(--border);
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 1rem;
	}

	.search__input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
</style>
