import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

import ReleaseNotice from './ReleaseNotice.svelte';

describe('documentation component markup', () => {
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

	it('contains only vertical overscroll in scroll panes', async () => {
		const [readingArea, symbolsIndex, mobileNav, docsShell] = await Promise.all([
			source('../../../../src/lib/docs/site/ReadingArea.svelte'),
			source('./SymbolsIndex.svelte'),
			source('../../../docs-ui/src/components/MobileNav.svelte'),
			source('./DocsShell.svelte')
		]);

		for (const component of [readingArea, symbolsIndex, mobileNav, docsShell]) {
			expect(component).not.toMatch(/overscroll-behavior:\s*contain/);
		}

		expect(readingArea).toMatch(/\.layout__sidebar[\s\S]*overscroll-behavior-y:\s*contain/);
		expect(readingArea).toMatch(/\.layout__main[\s\S]*overscroll-behavior-y:\s*contain/);
		expect(readingArea).toMatch(/\.layout__toc[\s\S]*overscroll-behavior-y:\s*contain/);
		expect(symbolsIndex).toMatch(/\.results[\s\S]*overscroll-behavior-y:\s*contain/);
		expect(mobileNav).toMatch(/\.menu__body[\s\S]*overscroll-behavior-y:\s*contain/);
		expect(docsShell).toMatch(/\.layout__sidebar[\s\S]*overscroll-behavior-y:\s*contain/);
		expect(docsShell).toMatch(/\.layout__main[\s\S]*overscroll-behavior-y:\s*contain/);
		expect(docsShell).toMatch(/\.layout__toc[\s\S]*overscroll-behavior-y:\s*contain/);
	});
});

function source(relative: string): Promise<string> {
	return readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}
