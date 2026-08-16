/**
 * Everything a documentation page may import.
 *
 * Authored `.svx` pages import from `#lib/docs` and nothing deeper. That keeps the authoring surface
 * one short list, and lets the internals move without editing pages.
 */

export { default as Badge } from './components/Badge.svelte';
export { default as Callout } from './components/Callout.svelte';
export { default as CopyButton } from './components/CopyButton.svelte';
export { default as Example } from './components/Example.svelte';
export { default as PackageInstall } from './components/PackageInstall.svelte';
export { default as Steps } from './components/Steps.svelte';
export { default as SymbolImpls } from './components/SymbolImpls.svelte';
export { default as SymbolMembers } from './components/SymbolMembers.svelte';
export { default as SymbolMeta } from './components/SymbolMeta.svelte';
export { default as SymbolSignature } from './components/SymbolSignature.svelte';
export { default as Tabs } from './components/Tabs.svelte';

export { docsConfig, latestVersion, resolveVersion, type DocsVersion } from './config.ts';
export type { DocFrontmatter, DocHeading, DocSection, DocSummary, SymbolFrontmatter } from './content/types.ts';
export { notify } from './notify.svelte.ts';
export { getSymbolInfo, type SymbolInfo, type SymbolLink, type SymbolMember } from './symbol.svelte.ts';
export { getDocsVersion } from './version.svelte.ts';
