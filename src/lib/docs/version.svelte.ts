/**
 * The documented framework version, for components rendered inside a page.
 *
 * Passed through Svelte context rather than read from the URL: components must work identically
 * when a page is rendered from a different version's route, and reading `page.params` would tie
 * every component to one routing scheme.
 *
 * The context holds a getter rather than the value, so a component reads the version at the moment
 * it renders instead of capturing whatever it was when the layout first initialised.
 */

import { getContext, setContext } from 'svelte';

import { docsConfig, type DocsVersion, latestVersion } from './config.ts';

const KEY = Symbol('framework-docs-version');

export function setDocsVersion(version: () => DocsVersion): void {
	setContext(KEY, version);
}

/**
 * The version of the surrounding docs route.
 *
 * Falls back to the configured latest release so that a documentation component still renders
 * outside a docs route — in a component test, or on a marketing page reusing a callout.
 */
export function getDocsVersion(): DocsVersion {
	return getContext<(() => DocsVersion) | undefined>(KEY)?.() ?? latestVersion(docsConfig);
}
