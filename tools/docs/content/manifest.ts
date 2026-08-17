/**
 * Build-time index of every page's frontmatter, as a virtual module.
 *
 * The problem this solves is structural rather than incidental. Navigation needs the metadata of
 * *every* page on *every* route; a page's markup is needed only when that page is read. While
 * metadata was an export of the compiled module, wanting the first meant importing the second, so
 * the content glob had to be eager and every page's compiled markup — highlighted code, symbol
 * annotations and all — landed in one chunk that every visitor downloaded in full.
 *
 * Serving the metadata from a module that imports nothing breaks the dependency. Navigation reads
 * this; the route reads the page it needs and nothing else; the compiler is free to split.
 *
 * The manifest is generated from the filesystem, so adding a page needs no registration anywhere.
 * It is regenerated when a content file changes, and the module is invalidated so the dev server
 * picks it up like any other edit.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { Plugin } from 'vite';

import { type FrontmatterValue, parseFrontmatter } from './frontmatter.ts';

/** Import specifier pages read the manifest from. */
export const MANIFEST_MODULE = 'virtual:docs-manifest';

/** Rollup convention: a resolved virtual module id starts with a null byte. */
const RESOLVED = `\0${MANIFEST_MODULE}`;

/** Where each kind of page lives, relative to the project root. */
const SOURCES = {
	guides: path.join('src', 'content', 'docs'),
	symbols: path.join('src', 'content', 'symbols')
} as const;

/** One page, as the manifest records it. */
export interface ManifestEntry {
	/**
	 * Path relative to its content root, without the extension.
	 *
	 * Keeps any exact-SemVer directory, because the path gate is part of how the page is
	 * resolved and stripping it here would lose which version the entry belongs to.
	 */
	readonly relativePath: string;
	/** The file's path from the project root, which is the key the component glob uses. */
	readonly file: string;
	readonly frontmatter: Record<string, FrontmatterValue>;
}

export interface DocsManifest {
	readonly guides: readonly ManifestEntry[];
	readonly symbols: readonly ManifestEntry[];
}

/** Every `.svx` under a directory, recursively. Missing directories yield nothing. */
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
	const root = path.join(projectRoot, source);
	const files = await pagesUnder(root);
	const entries: ManifestEntry[] = [];

	for (const file of files) {
		const contents = await readFile(file, 'utf8');
		const relative = path.relative(root, file).replaceAll(path.sep, '/');

		entries.push({
			relativePath: relative.replace(/\.svx$/, '').replace(/\/index$/, ''),
			// Rooted at the project, matching the keys `import.meta.glob` produces.
			file: `/${path.relative(projectRoot, file).replaceAll(path.sep, '/')}`,
			frontmatter: parseFrontmatter(contents, file)
		});
	}

	return entries;
}

export async function readManifest(projectRoot: string = process.cwd()): Promise<DocsManifest> {
	return {
		guides: await readEntries(projectRoot, SOURCES.guides),
		symbols: await readEntries(projectRoot, SOURCES.symbols)
	};
}

/**
 * Serves the manifest as a virtual module.
 *
 * A plugin rather than a generated file checked into the repository: a file would be a build
 * artifact that can be stale, and staleness here means the sidebar disagreeing with what exists.
 */
export function docsManifest(): Plugin {
	const projectRoot = process.cwd();
	const contentRoots = Object.values(SOURCES).map((source) => path.join(projectRoot, source));

	return {
		name: 'framework:docs-manifest',

		resolveId(id) {
			return id === MANIFEST_MODULE ? RESOLVED : undefined;
		},

		async load(id) {
			if (id !== RESOLVED) {
				return undefined;
			}

			const manifest = await readManifest(projectRoot);

			return `export const manifest = ${JSON.stringify(manifest)};\n`;
		},

		/**
		 * Rebuilds when a page's frontmatter changes.
		 *
		 * Any `.svx` edit invalidates it. Checking whether the frontmatter in particular changed would
		 * mean parsing on every keystroke to avoid an invalidation that costs a directory read.
		 */
		handleHotUpdate({ file, server }) {
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
