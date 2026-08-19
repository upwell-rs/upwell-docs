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

	it('uses no authorization header when no token is configured', async () => {
		const fetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ tree: [{ path: 'src/lib.rs', type: 'blob', size: 15 }] }), { status: 200 }))
			.mockResolvedValueOnce(new Response('pub struct App;', { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const service = sourceServiceWithoutInventory();

		await service.loadFile(source as never, version, 'src/lib.rs');

		expect(fetch.mock.calls[0][1]).toMatchObject({
			headers: { accept: 'application/vnd.github+json', 'user-agent': 'upwell-docs-source-viewer' }
		});
		expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('authorization');
	});

	it('uses the configured token for inventory requests without sending it to raw content', async () => {
		const fetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ tree: [{ path: 'src/lib.rs', type: 'blob', size: 15 }] }), { status: 200 }))
			.mockResolvedValueOnce(new Response('pub struct App;', { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const service = sourceServiceWithoutInventory({ token: 'source-viewer-token' });

		await service.loadFile(source as never, version, 'src/lib.rs');

		expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { authorization: 'Bearer source-viewer-token' } });
		expect(fetch.mock.calls[1][1].headers).not.toHaveProperty('authorization');
	});

	it('uses its token for the normalized canonical GitHub API origin', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tree: [] }), { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const service = sourceServiceWithoutInventory({ token: 'source-viewer-token', api: 'https://API.GITHUB.COM:443/' });

		await service.loadFile(source as never, version, 'src/lib.rs');

		expect(new URL(fetch.mock.calls[0][0]).origin).toBe('https://api.github.com');
		expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { authorization: 'Bearer source-viewer-token' } });
	});

	it('does not send its token to a custom fixture API origin', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tree: [] }), { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const service = sourceServiceWithoutInventory({ token: 'source-viewer-token', api: 'http://127.0.0.1:5199' });

		await service.loadFile(source as never, version, 'src/lib.rs');

		expect(new URL(fetch.mock.calls[0][0]).origin).toBe('http://127.0.0.1:5199');
		expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('authorization');
	});

	it.each([
		'https://api.github.com.attacker.example',
		'https://api.github.com/v1',
		'https://source-viewer-token@api.github.com'
	])('does not send its token to an untrusted GitHub API lookalike: %s', async (api) => {
		const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tree: [] }), { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const service = sourceServiceWithoutInventory({ token: 'source-viewer-token', api });

		await service.loadFile(source as never, version, 'src/lib.rs');

		expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('authorization');
	});

	it('preserves caller-provided fixture headers before token defaults', async () => {
		const fetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ tree: [{ path: 'src/lib.rs', type: 'blob', size: 15 }] }), { status: 200 }))
			.mockResolvedValueOnce(new Response('pub struct App;', { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const service = sourceServiceWithoutInventory({
			token: 'source-viewer-token',
			headers: { accept: 'application/json', authorization: 'Bearer fixture-token', 'user-agent': 'fixture-client' }
		});

		await service.loadFile(source as never, version, 'src/lib.rs');

		expect(fetch.mock.calls[0][1]).toMatchObject({
			headers: { accept: 'application/json', authorization: 'Bearer fixture-token', 'user-agent': 'fixture-client' }
		});
	});

	it('reports safe GitHub rate-limit diagnostics without disclosing its token', async () => {
		const token = 'source-viewer-token';
		const fetch = vi.fn().mockResolvedValue(new Response('GitHub error body must not be logged', {
			status: 403,
			headers: {
				'x-ratelimit-limit': '60',
				'x-ratelimit-remaining': '0',
				'x-ratelimit-reset': '1766592000',
				'x-ratelimit-resource': 'core',
				'x-github-request-id': 'ABC1:DEF2:1234:5678:9ABC'
			}
		}));
		vi.stubGlobal('fetch', fetch);
		const service = sourceServiceWithoutInventory({ token });

		await expect(service.loadFile(source as never, version, 'src/lib.rs')).rejects.toThrow(
			'GitHub source inventory request failed (status 403; rate limit exhausted; x-ratelimit-limit=60; x-ratelimit-remaining=0; x-ratelimit-reset=1766592000; x-ratelimit-resource=core; x-github-request-id=ABC1:DEF2:1234:5678:9ABC).'
		);
		await expect(service.loadFile(source as never, version, 'src/lib.rs')).rejects.not.toThrow(token);
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

	it("resolves a README's own links against the file that wrote them", async () => {
		const readme = '## Usage\n\n[guide](../../docs/guide.md?plain=1#L4), [logo](assets/logo.png), ![logo](assets/logo.png), ![icon](icons.svg#warning), [usage](#usage)';
		const fetch = vi.fn().mockResolvedValue(new Response(readme, { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const service = createSourceService({
			config: { framework: { root: source, crates: [] } } as never,
			artifacts: {
				getArtifact: async () => ({
					manifest: { sources: [{ crate: 'upwell', version: '1.0.0', repository: source.repository, sha: 'abc123', crates: ['upwell'], primary: true, files: [{ path: 'crates/app/README.md', bytes: readme.length }] }] },
					index: { symbols: [], paths: {} }
				})
			} as never,
			fileHref: (crate, versionId, file) => `/docs/${crate}/${versionId}/src/${file}`
		});

		const directory = await service.loadFile(source as never, version, 'crates/app');

		// A viewable file stays in the site — with the query and fragment that were written about it, not
		// folded into its name — anything else goes to the repository at the pinned revision, an embedded
		// image goes to the bytes, and a same-page fragment names the id the sanitizer emits.
		expect(directory?.markdownHtml).toContain('href="/docs/upwell/v1/src/docs/guide.md?plain=1#L4"');
		expect(directory?.markdownHtml).toContain('href="https://github.com/upwell-rs/upwell/blob/abc123/crates/app/assets/logo.png"');
		expect(directory?.markdownHtml).toContain('src="https://raw.githubusercontent.com/upwell-rs/upwell/abc123/crates/app/assets/logo.png"');
		expect(directory?.markdownHtml).toContain('src="https://raw.githubusercontent.com/upwell-rs/upwell/abc123/crates/app/icons.svg#warning"');
		expect(directory?.markdownHtml).toContain('href="#user-content-usage"');
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
		expect(await service.loadFile(source as never, version, decodeURIComponent('%2e%2e/secret.rs'))).toBeNull();
		expect(await service.loadFile(source as never, version, 'src/missing.rs')).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('loads a decoded literal-percent filename from an encoded route segment', async () => {
		const contents = 'pub const PERCENT: bool = true;\n';
		const fetch = vi.fn().mockResolvedValue(new Response(contents, { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const service = createSourceService({
			config: { framework: { root: source, crates: [] } } as never,
			artifacts: {
				getArtifact: async () => ({
					manifest: { sources: [{ crate: 'upwell', version: '1.0.0', repository: source.repository, sha: 'abc123', crates: ['upwell'], primary: true, files: [{ path: 'src/malformed%2 name.rs', bytes: contents.length }] }] },
					index: { symbols: [], paths: {} }
				})
			} as never
		});

		const file = await service.loadFile(source as never, version, decodeURIComponent('src/malformed%252%20name.rs'));

		expect(file).toMatchObject({ path: 'src/malformed%2 name.rs', contents });
		expect(fetch).toHaveBeenCalledWith(
			'https://raw.githubusercontent.com/upwell-rs/upwell/abc123/src/malformed%252%20name.rs',
			expect.objectContaining({ headers: { accept: 'text/plain' } })
		);
	});

	it('renders semantic members and preserves bound ambiguity', async () => {
		const contents = [
			'use crate::prelude::*;',
			'fn run<T: Alpha + Beta>(value: T, item: Thing, object: Alpha) {',
			'    Thing::new();',
			'    Kind::Ready;',
			'    item.field;',
			'    item.method();',
			'    value.shared();',
			'    object.only_alpha();',
			'}'
		].join('\n');
		const symbols = [
			symbolFixture('crate::Thing', 'Thing', 'struct'),
			symbolFixture('crate::Thing::new', 'new', 'assoc_fn'),
			symbolFixture('crate::Thing::field', 'field', 'struct_field'),
			symbolFixture('crate::Thing::method', 'method', 'method'),
			symbolFixture('crate::Kind', 'Kind', 'enum'),
			symbolFixture('crate::Kind::Ready', 'Ready', 'variant'),
			symbolFixture('crate::Alpha', 'Alpha', 'trait'),
			symbolFixture('crate::Alpha::shared', 'shared', 'method'),
			symbolFixture('crate::Alpha::only_alpha', 'only_alpha', 'method'),
			symbolFixture('crate::Beta', 'Beta', 'trait'),
			symbolFixture('crate::Beta::shared', 'shared', 'method')
		];
		const fetch = vi.fn().mockResolvedValue(new Response(contents, { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const service = createSourceService({
			config: { framework: { root: source, crates: [] } } as never,
			artifacts: {
				getArtifact: async () => ({
					manifest: { sources: [{ crate: 'upwell', version: '1.0.0', repository: source.repository, sha: 'abc123', crates: ['crate'], primary: true, files: [{ path: 'src/lib.rs', bytes: contents.length }] }] },
					index: {
						symbols,
						paths: Object.fromEntries(symbols.map((symbol) => [symbol.path, symbol.path])),
						names: Object.groupBy(symbols.map((symbol) => symbol.path), (path) => path.split('::').at(-1)!) as never,
						externals: { symbols: [], names: {}, direct: [], aliases: {} }
					}
				})
			} as never
		});

		const file = await service.loadFile(source as never, version, 'src/lib.rs');

		expect(file?.sourceHtml).toContain('data-symbol="crate::Thing::new"');
		expect(file?.sourceHtml).toContain('data-symbol="crate::Kind::Ready"');
		expect(file?.sourceHtml).toContain('data-symbol="crate::Thing::field"');
		expect(file?.sourceHtml).toContain('data-symbol="crate::Thing::method"');
		expect(file?.sourceHtml).toContain('data-symbol="crate::Alpha::only_alpha"');
		expect(file?.sourceHtml).toContain('data-candidates=');
		expect(file?.sourceHtml).toContain('crate::Alpha::shared');
		expect(file?.sourceHtml).toContain('crate::Beta::shared');
	});
});

function symbolFixture(path: string, name: string, kind: string) {
	return {
		path, name, kind, procMacro: null, crate: 'crate', signature: `${kind} ${name}`, doc: null, docs: null,
		source: { file: 'src/definitions.rs', line: 1 }, deprecation: null, feature: null, returns: null,
		implementations: [], implementors: [], derefTarget: null, aliasOf: null
	};
}

function sourceServiceWithoutInventory(github?: { api?: string; token?: string; headers?: HeadersInit }) {
	return createSourceService({
		config: { framework: { root: source, crates: [] } } as never,
		artifacts: {
			getArtifact: async () => ({
				manifest: { sources: [{ crate: 'upwell', version: '1.0.0', repository: source.repository, sha: 'abc123', crates: ['upwell'], primary: true }] },
				index: { symbols: [], paths: {} }
			})
		} as never,
		github
	});
}
