<script lang="ts">
	import { SymbolPage } from '@upwell/docs-kit/components';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<SymbolPage page={data.page} symbol={data.symbol} component={data.component} kind={data.kind} docsHtml={data.docsHtml} />
