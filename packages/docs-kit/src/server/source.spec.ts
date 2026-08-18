import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSourceService } from './source.ts';

const source = {
	crate: 'upwell',
	repository: 'https://github.com/upwell-rs/upwell',
	versions: [],
	latest: 'v1',
	releaseTag: (version: string) => version
};
const version = { id: 'v1', releaseVersion: { raw: '1.0.0' }, label: '1.0.0' } as never;

afterEach(() => vi.unstubAllGlobals());

describe('createSourceService', () => {
	it('fetches only an inventoried file from the pinned GitHub revision', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response('pub struct App;', { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const service = createSourceService({
			config: { framework: { root: source, crates: [] } } as never,
			artifacts: {
				getArtifact: async () => ({
					manifest: { sources: [{ crate: 'upwell', version: '1.0.0', repository: source.repository, sha: 'abc123', crates: ['upwell'], primary: true, files: [{ path: 'src/lib.rs', bytes: 15 }] }] },
					index: { symbols: [], paths: {} }
				})
			} as never
		});

		const file = await service.loadFile(source as never, version, 'src/lib.rs');

		expect(fetch).toHaveBeenCalledWith(
			'https://raw.githubusercontent.com/upwell-rs/upwell/abc123/src/lib.rs',
			expect.objectContaining({ headers: { accept: 'text/plain' } })
		);
		expect(file).toMatchObject({ path: 'src/lib.rs', revision: 'abc123', contents: 'pub struct App;', markdownHtml: '' });
		expect(file?.sourceHtml).toContain('class="shiki');
	});

	it('renders the direct README when opening a directory', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response('# App\n\nHello.', { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const service = createSourceService({
			config: { framework: { root: source, crates: [] } } as never,
			artifacts: {
				getArtifact: async () => ({
					manifest: { sources: [{ crate: 'upwell', version: '1.0.0', repository: source.repository, sha: 'abc123', crates: ['upwell'], primary: true, files: [{ path: 'crates/app/README.md', bytes: 13 }] }] },
					index: { symbols: [], paths: {} }
				})
			} as never
		});

		const directory = await service.loadFile(source as never, version, 'crates/app');

		expect(directory).toMatchObject({ kind: 'directory', markdownPath: 'crates/app/README.md' });
		expect(directory?.markdownHtml).toContain('<h1 id="user-content-app">App</h1>');
	});

	it('renders an opened Markdown file as preview and plain source', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response('# App', { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const service = createSourceService({
			config: { framework: { root: source, crates: [] } } as never,
			artifacts: {
				getArtifact: async () => ({
					manifest: { sources: [{ crate: 'upwell', version: '1.0.0', repository: source.repository, sha: 'abc123', crates: ['upwell'], primary: true, files: [{ path: 'README.md', bytes: 5 }] }] },
					index: { symbols: [], paths: {}, externals: { symbols: [] } }
				})
			} as never
		});

		const markdown = await service.loadFile(source as never, version, 'README.md');

		expect(markdown).toMatchObject({ language: 'text', markdownPath: 'README.md' });
		expect(markdown?.markdownHtml).toContain('<h1 id="user-content-app">App</h1>');
		expect(markdown?.sourceHtml).toContain('class="shiki');
	});

	it('rejects traversal and paths absent from the inventory without fetching', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const service = createSourceService({
			config: { framework: { root: source, crates: [] } } as never,
			artifacts: {
				getArtifact: async () => ({
					manifest: { sources: [{ crate: 'upwell', version: '1.0.0', repository: source.repository, sha: 'abc123', crates: ['upwell'], primary: true, files: [{ path: 'src/lib.rs', bytes: 15 }] }] },
					index: { symbols: [], paths: {} }
				})
			} as never
		});

		expect(await service.loadFile(source as never, version, '../secret.rs')).toBeNull();
		expect(await service.loadFile(source as never, version, 'src/missing.rs')).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});
});
