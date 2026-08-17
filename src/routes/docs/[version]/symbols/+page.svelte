<script lang="ts">
	import { SymbolsIndex } from '@upwell/docs-kit/components';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<SymbolsIndex version={data.version} records={data.records} />
