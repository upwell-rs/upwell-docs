/** Builds a frontmatter-only documentation manifest as a Vite virtual module. */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { Plugin } from 'vite';

import { type FrontmatterValue, parseFrontmatter } from './frontmatter.ts';

export const MANIFEST_MODULE = 'virtual:docs-manifest';

const RESOLVED = `\0${MANIFEST_MODULE}`;

export const DEFAULT_SOURCES = {
	guides: path.join('src', 'content', 'docs'),
	symbols: path.join('src', 'content', 'symbols')
} as const;

export type DocsManifestSources = Record<string, string>;

export interface ManifestEntry {
	readonly relativePath: string;
	readonly file: string;
	readonly frontmatter: Record<string, FrontmatterValue>;
}

export type DocsManifest = Record<string, readonly ManifestEntry[]>;

export interface DocsManifestOptions {
	readonly sources?: DocsManifestSources;
}

async function pagesUnder(root: string): Promise<string[]> {
	const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
	const found: string[] = [];

	for (const entry of entries) {
		if (entry.isFile() && entry.name.endsWith('.svx')) {
			found.push(path.join(entry.parentPath, entry.name));
		}
	}

	return found.sort();
}

async function readEntries(projectRoot: string, source: string): Promise<ManifestEntry[]> {
	const root = path.resolve(projectRoot, source);
	const files = await pagesUnder(root);
	const entries: ManifestEntry[] = [];

	for (const file of files) {
		const contents = await readFile(file, 'utf8');
		const relative = path.relative(root, file).replaceAll(path.sep, '/');

		entries.push({
			relativePath: relative.replace(/\.svx$/, '').replace(/\/index$/, ''),
			file: `/${path.relative(projectRoot, file).replaceAll(path.sep, '/')}`,
			frontmatter: parseFrontmatter(contents, file)
		});
	}

	return entries;
}

/** Reads every configured page root without compiling its pages. */
export async function readManifest(
	projectRoot: string = process.cwd(),
	sources: DocsManifestSources = DEFAULT_SOURCES
): Promise<DocsManifest> {
	const manifest: Record<string, readonly ManifestEntry[]> = {};

	for (const [kind, source] of Object.entries(sources)) {
		manifest[kind] = await readEntries(projectRoot, source);
	}

	return manifest;
}

/** Serves a frontmatter-only documentation manifest as a Vite virtual module. */
export function docsManifest(options: DocsManifestOptions = {}): Plugin {
	let appRoot = process.cwd();
	const sources = options.sources ?? DEFAULT_SOURCES;

	return {
		name: 'framework:docs-manifest',

		configResolved(config) {
			appRoot = config.root;
		},

		resolveId(id) {
			return id === MANIFEST_MODULE ? RESOLVED : undefined;
		},

		async load(id) {
			if (id !== RESOLVED) {
				return undefined;
			}

			const manifest = await readManifest(appRoot, sources);

			return `export const manifest = ${JSON.stringify(manifest)};\n`;
		},

		handleHotUpdate({ file, server }) {
			const contentRoots = Object.values(sources).map((source) => path.resolve(appRoot, source));

			if (!file.endsWith('.svx') || !contentRoots.some((root) => file.startsWith(root))) {
				return undefined;
			}

			const module = server.moduleGraph.getModuleById(RESOLVED);

			if (module) {
				server.moduleGraph.invalidateModule(module);
			}

			return undefined;
		}
	};
}
