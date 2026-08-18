<script lang="ts">
	import { SourceViewer } from '@upwell/docs-kit/components';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.file.path || 'Source'} · {data.version.label}</title>
</svelte:head>

<SourceViewer source={data.source.crate} version={data.version.id} file={data.file} />
