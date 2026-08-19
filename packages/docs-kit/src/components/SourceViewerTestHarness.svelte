<script lang="ts">
	import type { SourceFile } from '../server/source.ts';
	import SourceViewer from './SourceViewer.svelte';

	let current = $state<SourceFile>({
		kind: 'file',
		path: 'src/lib.rs',
		contents: '',
		language: 'rust',
		repository: 'https://github.com/example/example',
		revision: 'abc123',
		githubHref: 'https://github.com/example/example/blob/abc123/src/lib.rs',
		files: [],
		targets: [],
		markdownHtml: '',
		markdownPath: null,
		sourceHtml: '<pre>pub fn example() {}</pre>'
	});

	function navigate(path: string): void {
		current = { ...current, path };
	}
</script>

<SourceViewer source="example" version="v1" file={current} />
<button type="button" onclick={() => { navigate('src/main.rs'); }}>Navigate</button>
<button type="button" onclick={() => { navigate('src/lib.rs'); }}>Back</button>
