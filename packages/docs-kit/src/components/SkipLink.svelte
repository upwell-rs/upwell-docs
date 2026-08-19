<script lang="ts">
	import { DOCS_MAIN_ID } from './shell-a11y.ts';
</script>

<a class="skip-link" href={`#${DOCS_MAIN_ID}`}>Skip to documentation</a>

<style>
	.skip-link {
		position: fixed;
		top: 0.75rem;
		left: 0.75rem;
		z-index: 100;
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--accent);
		border-radius: calc(var(--radius) - 2px);
		background: var(--surface-raised);
		color: var(--text);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--shadow) 35%, transparent);
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
		transform: translateY(calc(-100% - 1rem));
	}

	.skip-link:focus {
		transform: none;
	}
</style>
