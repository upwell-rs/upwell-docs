import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';

import SourceViewer from './SourceViewer.svelte';
import SourceViewerTestHarness from './SourceViewerTestHarness.svelte';

const file = {
	kind: 'file' as const,
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
};

describe('SourceViewer', () => {
	it('opens the mobile file drawer immediately when Files is clicked', async () => {
		const screen = render(SourceViewer, {
			source: 'example',
			version: 'v1',
			file
		});

		const files = screen.container.querySelector<HTMLButtonElement>('.files')!;
		const tree = screen.container.querySelector<HTMLElement>('.tree')!;

		files.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		await expect.poll(() => tree.classList.contains('tree--open')).toBe(true);
	});

	it('closes the mobile file drawer when the harness receives a new source-file path', async () => {
		const screen = render(SourceViewerTestHarness);
		const files = screen.container.querySelector<HTMLButtonElement>('.files')!;
		const tree = screen.container.querySelector<HTMLElement>('.tree')!;

		files.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await expect.poll(() => tree.classList.contains('tree--open')).toBe(true);

		const navigate = screen.container.querySelector<HTMLButtonElement>('button:last-child')!;
		navigate.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		await expect.poll(() => tree.classList.contains('tree--open')).toBe(false);
	});
});
