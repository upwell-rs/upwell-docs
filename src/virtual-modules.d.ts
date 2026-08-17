/**
 * Types for the build-time virtual modules.
 *
 * These modules are produced by Vite plugins and have no file on disk, so their shapes have to be
 * declared. Types come from their source modules rather than being restated, preventing drift.
 */

declare module 'virtual:docs-manifest' {
	import type { DocsManifest } from '@upwell/docs-vite/manifest';

	export const manifest: DocsManifest;
}

declare module 'virtual:docs-config' {
	import type { DocsConfig } from '#lib/docs/config';

	export const docsConfig: DocsConfig;
}
