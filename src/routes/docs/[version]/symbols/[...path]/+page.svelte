<script lang="ts">
	import { SymbolPage } from '@upwell/docs-kit/components';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<SymbolPage version={data.version} page={data.page} symbol={data.symbol} component={data.component} />
