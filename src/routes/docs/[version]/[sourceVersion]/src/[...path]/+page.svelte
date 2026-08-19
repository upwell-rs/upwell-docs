<script lang="ts">
	import { SourceViewer } from '@upwell/docs-kit/components';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<SourceViewer source={data.source.crate} version={data.version.id} file={data.file} />
