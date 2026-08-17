/**
 * Everything a documentation page may import.
 *
 * Authored `.svx` pages import from `#lib/docs` and nothing deeper. That keeps the authoring surface
 * one short list, and lets the internals move without editing pages.
 */

export {
	Badge,
	Callout,
	CopyButton,
	Example,
	Steps,
	SymbolImpls,
	SymbolMembers,
	SymbolMeta,
	SymbolSignature,
	Tabs
} from '@upwell/docs-ui';
export { default as PackageInstall } from './integrations/PackageInstall.svelte';

export { latestVersion, resolveVersion, type DocsConfig, type DocsVersion } from './config.ts';
export type { DocFrontmatter, DocHeading, DocSummary, NavigationGroup, NavigationNode, SymbolFrontmatter } from './content/types.ts';
export { notify } from './notify.svelte.ts';
export { getSymbolInfo, type SymbolInfo, type SymbolLink, type SymbolMember } from './symbol.svelte.ts';
export { getDocsVersion } from './version.svelte.ts';
