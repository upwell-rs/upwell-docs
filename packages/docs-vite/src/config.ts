/** Serves an application's root documentation configuration as a Vite virtual module. */

import path from 'node:path';
import process from 'node:process';

import type { Plugin } from 'vite';

/** Import specifier application modules use for the documentation configuration. */
export const CONFIG_MODULE = 'virtual:docs-config';

/** Rollup convention: a resolved virtual module id starts with a null byte. */
const RESOLVED = `\0${CONFIG_MODULE}`;

/** Options for the root documentation configuration virtual module. */
export interface DocsConfigOptions {
	/** File to expose, relative to Vite's app root unless absolute. */
	readonly file?: string;
}

/** Injects the app-root config without making application aliases available to it. */
export function docsConfig(options: DocsConfigOptions = {}): Plugin {
	let appRoot = process.cwd();

	return {
		name: 'framework:docs-config',

		configResolved(config) {
			appRoot = config.root;
		},

		resolveId(id) {
			return id === CONFIG_MODULE ? RESOLVED : undefined;
		},

		load(id) {
			if (id !== RESOLVED) {
				return undefined;
			}

			const configFile = path.resolve(appRoot, options.file ?? 'docs.config.ts');

			return `export { docsConfig } from ${JSON.stringify(configFile)};\n`;
		}
	};
}
