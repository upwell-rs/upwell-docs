/**
 * Types for the build-time virtual modules.
 *
 * `virtual:docs-manifest` is produced by the Vite plugin in `tools/docs/content/manifest.ts` and has
 * no file on disk, so its shape has to be declared. The types are imported from the plugin rather
 * than restated, which is what stops this declaration from drifting away from what is generated.
 */

declare module 'virtual:docs-manifest' {
	import type { DocsManifest } from '#tools/docs/content/manifest';

	export const manifest: DocsManifest;
}
