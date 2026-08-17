<!--
	Keyboard shortcuts for reading documentation, and the panel that lists them.

	Uses TanStack Hotkeys rather than hand-rolled `keydown` handling, which gets the tedious parts
	right: platform-correct `Mod` (Cmd on macOS, Ctrl elsewhere), not firing while the reader is
	typing in a field, and exact modifier matching.

	**Bindings are letters and arrows, never punctuation.** `[` and `]` are the conventional
	prev/next keys and were the original choice, but on Nordic and many other European layouts they
	are AltGr+8 and AltGr+9 — not keys you can press on their own. AltGr reports as Ctrl+Alt, and the
	matcher compares modifiers exactly, so the binding could never fire for those readers. Letters
	produce the same `event.key` on every Latin layout, which is the property worth having.

	Shortcuts are deliberately few. A documentation site earns keyboard support for moving between
	pages, not for everything it can do.

	**Escape is not bound here.** The panel is a `<dialog>`, which closes on Escape natively — and a
	hotkey would break that everywhere else, because this library defaults to `preventDefault` and
	`stopPropagation`, so a global Escape binding swallows the key before any dialog sees it. Leaving
	the platform to handle it is both less code and the only thing that works for every overlay.
-->
<script lang="ts">
	import { createHotkey, createHotkeySequence } from '@tanstack/svelte-hotkeys';
	import type { DocSummary } from '../types.ts';

	interface Props {
		previous?: DocSummary;
		next?: DocSummary;
		/** Opens the search dialog. */
		onsearch: () => void;
		navigate: (href: string) => void;
		pageHref: (slug: string) => string;
		homeHref: string;
	}

	let { previous, next, onsearch, navigate, homeHref, pageHref }: Props = $props();

	let dialog = $state<HTMLDialogElement>();

	const SHORTCUTS = [
		{ keys: ['Mod', 'K'], description: 'Search' },
		{ keys: ['/'], description: 'Search' },
		{ keys: ['p'], description: 'Previous page' },
		{ keys: ['n'], description: 'Next page' },
		{ keys: ['Alt', '←'], description: 'Previous page' },
		{ keys: ['Alt', '→'], description: 'Next page' },
		{ keys: ['g', 'h'], description: 'Documentation home' },
		{ keys: ['?'], description: 'Show this list' },
		{ keys: ['Esc'], description: 'Close' }
	];

	function open(slug: string | undefined): void {
		if (slug) {
			navigate(pageHref(slug));
		}
	}

	// The callbacks close over `previous` and `next`, which change on every navigation, so they read
	// the current pair rather than the one that existed when the shortcut was registered.
	createHotkey('P', () => open(previous?.slug));
	createHotkey('N', () => open(next?.slug));

	// Arrows for readers who expect browser-like back/forward within the guide order. Alt rather than
	// bare arrows, which have to keep scrolling.
	createHotkey({ key: 'ArrowLeft', alt: true }, () => open(previous?.slug));
	createHotkey({ key: 'ArrowRight', alt: true }, () => open(next?.slug));

	createHotkeySequence(['G', 'H'], () => navigate(homeHref));

	// `Mod` is Cmd on macOS and Ctrl elsewhere, which the library resolves per platform. `/` is the
	// other convention readers try, and is a plain key on every layout that has it.
	createHotkey({ key: 'K', mod: true }, () => onsearch());
	createHotkey('/', () => onsearch());

	// Modifiers are matched exactly, and `?` is Shift+something on every layout that has it.
	createHotkey({ key: '?', shift: true }, () => {
		if (dialog?.open) {
			dialog.close();
		} else {
			dialog?.showModal();
		}
	});
</script>

<dialog bind:this={dialog} class="shortcuts" aria-label="Keyboard shortcuts">
	<h2 class="shortcuts__title">Keyboard shortcuts</h2>
	<dl class="shortcuts__list">
		{#each SHORTCUTS as shortcut (shortcut.description + shortcut.keys.join())}
			<div class="shortcuts__row">
				<dt>
					{#each shortcut.keys as key, index (key)}
						{#if index > 0}<span class="shortcuts__plus">+</span>{/if}<kbd>{key}</kbd>
					{/each}
				</dt>
				<dd>{shortcut.description}</dd>
			</div>
		{/each}
	</dl>
</dialog>

<style>
	.shortcuts {
		width: min(20rem, calc(100vw - 3rem));
		padding: 1rem 1.125rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		color: var(--text);
		box-shadow: 0 8px 28px color-mix(in srgb, var(--shadow) 60%, transparent);
	}

	.shortcuts::backdrop {
		background: color-mix(in srgb, var(--shadow) 35%, transparent);
	}

	.shortcuts__title {
		margin: 0 0 0.75rem;
		color: var(--text-subtle);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.shortcuts__list {
		margin: 0;
	}

	.shortcuts__row {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 0.4rem;
		font-size: 0.8125rem;
	}

	.shortcuts__row:last-child {
		margin-bottom: 0;
	}

	.shortcuts__row dt {
		flex: 0 0 5rem;
	}

	.shortcuts__row dd {
		margin: 0;
		color: var(--text-muted);
	}

	.shortcuts__plus {
		margin: 0 0.15rem;
		color: var(--text-subtle);
	}

	kbd {
		display: inline-block;
		padding: 0.1rem 0.35rem;
		border: 1px solid var(--border);
		border-bottom-width: 2px;
		border-radius: 4px;
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
</style>
