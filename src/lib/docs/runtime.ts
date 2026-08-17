/**
 * Application-owned composition for the documentation framework.
 *
 * Packages never inspect this app's config, content root, virtual modules, or aliases. This is the
 * deliberate seam: the application supplies concrete config, manifest and literal Vite loader maps,
 * then delegates catalog and route behavior to `@upwell/docs-kit` under its `/docs` URL policy.
 */

import { error } from '@sveltejs/kit';
import { createDocsContent } from '@upwell/docs-kit/content';
import { createNotificationRuntime, createSearchIndex, createSidebarState } from '@upwell/docs-kit/client';
import { createDocsRouteHelpers } from '@upwell/docs-kit/sveltekit';
import type { Component } from 'svelte';
import { docsConfig } from 'virtual:docs-config';
import { manifest } from 'virtual:docs-manifest';

const guideModules = import.meta.glob<{ default: Component }>('/src/content/docs/**/*.svx');
const symbolModules = import.meta.glob<{ default: Component }>('/src/content/symbols/**/*.svx');

export const docsContent = createDocsContent({
	config: docsConfig,
	manifest: manifest as unknown as Parameters<typeof createDocsContent>[0]['manifest'],
	guideModules,
	symbolModules,
	basePath: '/docs'
});

export const docsClient = {
	searchIndex: createSearchIndex(),
	sidebar: createSidebarState('framework-docs'),
	notifications: createNotificationRuntime()
};

export const docsRoutes = createDocsRouteHelpers({
	content: docsContent,
	error: (status, body) => error(status, body)
});
