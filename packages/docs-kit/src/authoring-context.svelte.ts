import { getContext, setContext } from 'svelte';

import type { DocsVersion } from '@upwell/docs-core/config';

const KEY = Symbol('upwell-docs-authoring');

interface AuthoringContext {
	readonly defaultCrate: string;
	readonly version: () => DocsVersion;
}

export function setDocsAuthoringContext(context: AuthoringContext): void {
	setContext(KEY, context);
}

export function getDocsAuthoringContext(): AuthoringContext {
	const context = getContext<AuthoringContext | undefined>(KEY);

	if (!context) {
		throw new Error('No docs authoring context. PackageInstall must render under a docs shell.');
	}

	return context;
}

export function getDocsVersion(): DocsVersion {
	return getDocsAuthoringContext().version();
}
