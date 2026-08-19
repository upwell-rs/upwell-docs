import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

import type { DocsVersion } from '@upwell/docs-core/config';
import { createNotificationRuntime, createSearchIndex, createSidebarState } from '../client.svelte.ts';
import { DocsShell } from './index.ts';

describe('DocsShell compatibility export', () => {
	it('renders through the public components barrel with the legacy props', () => {
		const version = {
			id: 'v1' as DocsVersion['id'],
			label: '1.0',
			releaseVersion: { raw: '1.0.0' } as DocsVersion['releaseVersion']
		} satisfies DocsVersion;
		const source = {
			crate: 'framework',
			repository: 'https://example.test/framework',
			versions: [version],
			latest: version.id,
			releaseTag: (release: string) => `v${release}`
		};
		const content = {
			config: { framework: { name: 'Framework', root: source, crates: [] }, landingSlug: 'getting-started' },
			pageHref: (versionId: string, slug: string) => `/docs/${versionId}/${slug}`,
			symbolHref: (crate: string, versionId: string, path: string) => `/docs/${crate}/${versionId}/symbols/${path}`,
			sourceHref: (crate: string, versionId: string, path: string) => `/docs/${crate}/${versionId}/src/${path}`,
			findPage: () => undefined,
			findSymbolPage: () => undefined,
			navigationFor: () => [],
			topics: { present: () => [] }
		} as never;
		const children = createRawSnippet(() => ({ render: () => '<p>Legacy content</p>' }));

		const body = render(DocsShell, {
			props: {
				content,
				version,
				pathname: '/docs/v1/getting-started',
				searchIndex: createSearchIndex(),
				sidebar: createSidebarState('docs-shell-compat'),
				notifications: createNotificationRuntime(),
				navigate: () => {},
				assignLocation: () => {},
				children
			}
		}).body;

		expect(body).toContain('Legacy content');
		expect(body).toContain('Skip to documentation');
	});
});
