<script lang="ts">
	interface Props {
		code: string;
		class?: string;
	}

	type TokenKind = 'comment' | 'keyword' | 'macro' | 'number' | 'string' | 'type' | 'plain';

	const KEYWORDS = new Set([
		'as', 'async', 'const', 'crate', 'dyn', 'else', 'enum', 'extern', 'fn', 'for', 'impl',
		'in', 'let', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self',
		'static', 'struct', 'super', 'trait', 'type', 'unsafe', 'use', 'where'
	]);
	const TOKEN = /\/\/[^\n]*|r#*"[\s\S]*?"#*|b?"(?:\\.|[^"\\])*"|b?'(?:\\.|[^'\\])+'|\b\d(?:[\d_]*(?:\.\d[\d_]*)?)?\b|[A-Za-z_][A-Za-z0-9_]*!?|\s+|./g;

	let { code, class: className }: Props = $props();

	const tokens = $derived([...code.matchAll(TOKEN)].map(([text], index): { id: number; text: string; kind: TokenKind } => {
		if (text.startsWith('//')) return { id: index, text, kind: 'comment' };
		if (/^(?:r#*|b)?["']/.test(text)) return { id: index, text, kind: 'string' };
		if (/^\d/.test(text)) return { id: index, text, kind: 'number' };
		if (text.endsWith('!')) return { id: index, text, kind: 'macro' };
		if (KEYWORDS.has(text)) return { id: index, text, kind: 'keyword' };
		if (/^[A-Z]/.test(text)) return { id: index, text, kind: 'type' };

		return { id: index, text, kind: 'plain' };
	}));
</script>

<pre class={className}><code>{#each tokens as token (token.id)}<span class:token--comment={token.kind === 'comment'} class:token--keyword={token.kind === 'keyword'} class:token--macro={token.kind === 'macro'} class:token--number={token.kind === 'number'} class:token--string={token.kind === 'string'} class:token--type={token.kind === 'type'}>{token.text}</span>{/each}</code></pre>

<style>
	.token--comment { color: #6e7781; font-style: italic; }
	.token--keyword { color: #cf222e; }
	.token--macro { color: #8250df; }
	.token--number { color: #0550ae; }
	.token--string { color: #0a3069; }
	.token--type { color: #953800; }

	@media (prefers-color-scheme: dark) {
		.token--comment { color: #8b949e; }
		.token--keyword { color: #ff7b72; }
		.token--macro { color: #d2a8ff; }
		.token--number { color: #79c0ff; }
		.token--string { color: #a5d6ff; }
		.token--type { color: #ffa657; }
	}
</style>
