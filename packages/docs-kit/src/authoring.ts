import { getSymbolInfo } from '@upwell/docs-ui/context';

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
export { GuideRef, PackageInstall, SrcRef, SymbolRef } from './components/index.ts';
export type { DocFrontmatter, DocHeading, DocSummary, NavigationGroup, NavigationNode, SymbolFrontmatter } from '@upwell/docs-core/content';
export type { SymbolInfo, SymbolLink, SymbolMember } from '@upwell/docs-ui/types';
export { getDocsVersion } from './authoring-context.svelte.ts';
export { getSymbolInfo };
