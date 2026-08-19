<script lang="ts">
	import { GuidePage } from '@upwell/docs-kit/components';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<GuidePage component={data.component} />
