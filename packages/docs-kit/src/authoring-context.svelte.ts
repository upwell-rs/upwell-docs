import { getContext, setContext } from 'svelte';

import type { DocsVersion } from '@upwell/docs-core/config';

const KEY = Symbol('upwell-docs-authoring');

export interface AuthoringContext {
	readonly defaultCrate: string;
	readonly version: () => DocsVersion;
	readonly guideHref: (slug: string) => string;
	readonly symbolHref: (path: string, source?: string, version?: string) => string;
	readonly sourceHref: (path: string, source?: string, version?: string) => string;
}

export function setDocsAuthoringContext(context: AuthoringContext): void {
	setContext(KEY, context);
}

export function getDocsAuthoringContext(): AuthoringContext {
	const context = getContext<AuthoringContext | undefined>(KEY);

	if (!context) {
		throw new Error('No docs authoring context. Authoring components must render under a docs shell.');
	}

	return context;
}

export function getDocsVersion(): DocsVersion {
	return getDocsAuthoringContext().version();
}
