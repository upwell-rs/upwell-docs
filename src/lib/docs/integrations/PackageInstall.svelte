<script lang="ts">
	import { PackageInstall as Install } from '@upwell/docs-ui';
import { docsConfig } from 'virtual:docs-config';

	import { formatVersion } from '../version/semver.ts';
	import { getDocsVersion } from '../version.svelte.ts';

	interface Props {
		crate?: string;
		features?: readonly string[];
		pin?: boolean;
	}

	let { crate = docsConfig.framework.crate, features = [], pin = false }: Props = $props();
	const version = getDocsVersion();
</script>

<Install {crate} {features} {pin} version={formatVersion(version.releaseVersion)} />
