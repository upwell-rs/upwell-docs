import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

import ReleaseNotice from './ReleaseNotice.svelte';
import SkipLink from './SkipLink.svelte';
import { DOCS_MAIN_ID } from './shell-a11y.ts';

describe('documentation shell markup', () => {
	it('links the first shell control to the stable reading pane target', async () => {
		const link = render(SkipLink).body;
		const shell = await source('./DocsShell.svelte');

		expect(link).toContain(`href="#${DOCS_MAIN_ID}"`);
		expect(link).toContain('Skip to documentation');
		expect(shell).toContain('id={DOCS_MAIN_ID}');
		expect(shell).toContain('tabindex="-1"');
		expect(shell.indexOf('<SkipLink />')).toBeLessThan(shell.indexOf('<DocsHeader'));
	});

	it('renders the historical-release message as a labelled aside', () => {
		const body = render(ReleaseNotice, {
			props: { notice: { currentLabel: '1.0', latestLabel: '2.0', href: '/docs/v2/guide' } }
		}).body;

		expect(body).toContain('<aside');
		expect(body).toContain('aria-label="Release notice"');
		expect(body).toContain('Older release.');
		expect(body).toContain('href="/docs/v2/guide"');
	});

	it('renders no release message without notice data', () => {
		expect(render(ReleaseNotice).body).not.toContain('<aside');
	});

	it('keeps the header sticky only below the desktop pane breakpoint', async () => {
		const header = await source('../../../docs-ui/src/components/DocsHeader.svelte');

		expect(header).toMatch(/@media \(max-width: 59\.999rem\)[\s\S]*position: sticky;[\s\S]*z-index: 20;/);
	});

	it('keeps code copy controls visible when hover is unavailable', async () => {
		const styles = await source('../../../docs-ui/src/styles.css');

		expect(styles).toMatch(/@media \(hover: none\), \(pointer: coarse\)[\s\S]*\.code-block__copy[\s\S]*opacity: 1;/);
	});
});

function source(relative: string): Promise<string> {
	return readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}
