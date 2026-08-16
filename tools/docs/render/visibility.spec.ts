import { describe, expect, it } from 'vitest';
import { parseMeta, renderCodeBlock } from './highlight.ts';

describe('parseMeta visibility', () => {
	it('defaults to shown', () => {
		expect(parseMeta('title="A router"').visibility).toBe('shown');
	});

	it('reads a context block', () => {
		expect(parseMeta('context').visibility).toBe('context');
	});

	it('reads a collapsed block', () => {
		expect(parseMeta('collapsed title="Supporting types"').visibility).toBe('collapsed');
	});
});

describe('renderCodeBlock visibility', () => {
	it('renders a context block as nothing at all', async () => {
		// It exists to contribute declarations to its example, not to be read.
		expect(await renderCodeBlock('struct Greeter {}', 'rust', 'context')).toBe('');
	});

	it('folds a collapsed block behind a summary that in-page find can open', async () => {
		const html = await renderCodeBlock('struct Greeter {}', 'rust', 'collapsed title="Types"');

		expect(html).toContain('<details class="code-block__folded">');
		expect(html).toContain('<summary>Types</summary>');
		// The code is still in the page, which is what makes hiding it safe.
		expect(html).toContain('Greeter');
	});

	it('names an unlabelled collapsed block, since a summary needs text', async () => {
		expect(await renderCodeBlock('struct Greeter {}', 'rust', 'collapsed')).toContain('Supporting code');
	});
});
