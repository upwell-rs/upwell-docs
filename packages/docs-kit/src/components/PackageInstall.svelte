<script lang="ts">
	import { PackageInstall as Install } from '@upwell/docs-ui';
	import type { DocsVersion } from '@upwell/docs-core/config';
	import { formatVersion } from '@upwell/docs-core/semver';

	import { getDocsAuthoringContext, getDocsVersion } from '../authoring-context.svelte.ts';

	interface Props {
		version?: DocsVersion;
		crate?: string;
		features?: readonly string[];
		pin?: boolean;
	}

	let { version, crate, features = [], pin = false }: Props = $props();

	const resolvedVersion = $derived(version ?? getDocsVersion());
	const resolvedCrate = $derived(crate ?? getDocsAuthoringContext().defaultCrate);
</script>

<Install crate={resolvedCrate} {features} {pin} version={formatVersion(resolvedVersion.releaseVersion)} />
