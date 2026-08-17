import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { MANIFEST_MODULE, docsManifest, readManifest } from './manifest.ts';

describe('documentation manifest', () => {
	it('reads frontmatter relative to the configured application root', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'docs-vite-'));
		const guide = path.join(root, 'content', 'guides', 'getting-started.svx');

		await mkdir(path.dirname(guide), { recursive: true });
		await writeFile(guide, '---\ntitle: Getting started\ndraft: false\n---\n\n# Getting started\n');

		try {
			const sources = { guides: 'content/guides' };
			const manifest = await readManifest(root, sources);
			const plugin = docsManifest({ sources });
			const configResolved = plugin.configResolved;
			const load = plugin.load;

			expect(manifest).toEqual({
				guides: [
					{
						relativePath: 'getting-started',
						file: '/content/guides/getting-started.svx',
						frontmatter: { title: 'Getting started', draft: false }
					}
				]
			});

			if (typeof configResolved !== 'function' || typeof load !== 'function') {
				throw new Error('The manifest plugin must provide function hooks.');
			}

			configResolved.call({} as never, { root } as never);

			expect(await load.call({} as never, `\0${MANIFEST_MODULE}`)).toBe(
				`export const manifest = ${JSON.stringify(manifest)};\n`
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
