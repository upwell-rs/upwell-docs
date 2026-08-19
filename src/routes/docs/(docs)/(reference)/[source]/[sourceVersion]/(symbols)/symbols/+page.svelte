<script lang="ts">
	import { SymbolsIndex } from '@upwell/docs-kit/components';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<SymbolsIndex source={data.source} records={data.records} sources={data.sources} />
