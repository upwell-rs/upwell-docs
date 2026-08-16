<!--
	The `cargo add` line for a framework crate, with its features.

	The version is never written into a page, and by default not printed at all: `cargo add framework`
	resolves to the newest release, which is what a reader following current documentation wants. A
	pinned command would freeze into whatever the docs were built against and quietly go stale in
	everyone's copy-paste history.

	`pin` prints the exact version the page documents, for a guide that genuinely depends on one.

	Features are listed explicitly because a framework's surface can be feature-gated: an example that needs
	`axum` and `stomp` is wrong without them.
-->
<script lang="ts">
	import { docsConfig } from '../config.ts';
	import { formatVersion } from '../version/semver.ts';
	import { getDocsVersion } from '../version.svelte.ts';
	import CopyButton from './CopyButton.svelte';

	interface Props {
		/** Crate to install. Defaults to the framework's facade crate. */
		crate?: string;
		/** Cargo features to enable. */
		features?: readonly string[];
		/** Print the exact version this page documents rather than resolving to the newest release. */
		pin?: boolean;
	}

	let { crate = docsConfig.framework.crate, features = [], pin = false }: Props = $props();

	const version = getDocsVersion();

	const spec = $derived(pin ? `${crate}@${formatVersion(version.frameworkVersion)}` : crate);

	const command = $derived(
		features.length > 0 ? `cargo add ${spec} --features ${features.join(',')}` : `cargo add ${spec}`
	);
</script>

<div class="install">
	<code class="install__command">{command}</code>
	<CopyButton text={command} label="Copy install command" />
</div>

<style>
	.install {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1.25rem 0;
		padding: 0.5rem 0.5rem 0.5rem 0.875rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
	}

	.install__command {
		flex: 1;
		overflow-x: auto;
		background: none;
		padding: 0;
		font-size: 0.875rem;
		white-space: nowrap;
	}
</style>
