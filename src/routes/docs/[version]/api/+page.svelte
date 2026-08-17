<script lang="ts">
	import { ApiIndex } from '@upwell/docs-kit/components';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<ApiIndex version={data.version} records={data.records} />
