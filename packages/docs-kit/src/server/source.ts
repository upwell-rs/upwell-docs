import type { DocsConfig, DocsVersion, FrameworkCrateCoordinates } from '@upwell/docs-core/config';
import type { SymbolInfo } from '@upwell/docs-ui/types';
import type { ArtifactSource } from '@upwell/docs-tools/artifact/schema';
import { renderSourceCode, type SourceCodeAnnotation } from '@upwell/docs-tools/render/highlight';
import type { ExternalSymbol } from '@upwell/docs-tools/rustdoc/symbols';

import { tokenizeSource } from '../components/source-viewer/model.ts';
import type { ArtifactService } from './artifact.ts';
import { renderSourceMarkdown } from './markdown.ts';

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const SOURCE_TIMEOUT_MS = 8_000;

export interface SourceFileEntry {
	readonly path: string;
	readonly bytes: number;
}

export interface SourceTokenTarget {
	readonly name: string;
	readonly kind: string;
	readonly lens: 'callable' | 'field' | 'macro' | 'module' | 'type' | 'value';
	readonly procMacro: 'bang' | 'attribute' | 'derive' | null;
	readonly source: string;
	readonly version: string;
	readonly path: string;
	readonly line: number;
	readonly symbol: string;
	readonly reachablePaths: readonly string[];
	readonly docsHref: string | null;
	readonly signature: string | null;
	readonly doc: string | null;
	readonly feature: string | null;
	readonly deprecated: string | null;
}

export interface SourceFile {
	readonly kind: 'file' | 'directory';
	readonly path: string;
	readonly contents: string;
	readonly language: string;
	readonly repository: string;
	readonly revision: string;
	readonly githubHref: string;
	readonly files: readonly SourceFileEntry[];
	readonly targets: readonly SourceTokenTarget[];
	readonly markdownHtml: string;
	readonly markdownPath: string | null;
	readonly sourceHtml: string;
}

export interface SourceService {
	loadFile(source: FrameworkCrateCoordinates, version: DocsVersion, file: string): Promise<SourceFile | null>;
	loadSymbol(source: FrameworkCrateCoordinates, version: DocsVersion, path: string): Promise<SymbolInfo | undefined>;
}

export interface SourceServiceOptions {
	readonly config: DocsConfig;
	readonly artifacts: ArtifactService;
}

/** GitHub-backed source access pinned to repository revisions recorded in documentation artifacts. */
export function createSourceService(options: SourceServiceOptions): SourceService {
	const inventories = new Map<string, Promise<readonly SourceFileEntry[]>>();
	const files = new Map<string, Promise<string | null>>();

	async function resolveSnapshot(source: FrameworkCrateCoordinates, version: DocsVersion) {
		const artifact = await options.artifacts.getArtifact(source, version);
		const snapshot = artifact?.manifest.sources?.find((entry) => entry.crate === source.crate);

		return artifact && snapshot ? { artifact, snapshot } : null;
	}

	async function inventory(snapshot: ArtifactSource): Promise<readonly SourceFileEntry[]> {
		if (snapshot.files) {
			return snapshot.files;
		}

		const key = `${snapshot.repository}@${snapshot.sha}`;
		const existing = inventories.get(key);

		if (existing) {
			return existing;
		}

		const loading = fetchGithubTree(snapshot);
		inventories.set(key, loading);

		try {
			return await loading;
		} catch (cause) {
			inventories.delete(key);
			throw cause;
		}
	}

	return {
		async loadFile(source, version, requested) {
			const file = safeSourcePath(requested, true);

			if (file === null) {
				return null;
			}

			const resolved = await resolveSnapshot(source, version);

			if (!resolved) {
				return null;
			}

			const { artifact, snapshot } = resolved;
			const inventoryFiles = await inventory(snapshot);
			const entry = inventoryFiles.find((candidate) => candidate.path === file);
			const directory = file === '' || inventoryFiles.some((candidate) => candidate.path.startsWith(`${file}/`));

			if (!entry && !directory) {
				return null;
			}

			if (!entry) {
				const readme = inventoryFiles.find((candidate) => candidate.path.toLowerCase() === `${file ? `${file}/` : ''}readme.md`.toLowerCase());
				const readmeContents = readme && readme.bytes <= MAX_SOURCE_BYTES ? await fetchSource(snapshot, readme.path, files) : null;

				return {
					kind: 'directory',
					path: file,
					contents: '',
					language: '',
					repository: snapshot.repository,
					revision: snapshot.sha,
					githubHref: `${snapshot.repository}/tree/${snapshot.sha}${file ? `/${encodePath(file)}` : ''}`,
					files: inventoryFiles,
					targets: [],
					markdownHtml: await renderSourceMarkdown(readmeContents),
					markdownPath: readme?.path ?? null,
					sourceHtml: ''
				};
			}

			if (entry.bytes > MAX_SOURCE_BYTES || !isTextSource(file)) {
				return null;
			}

			const contents = await fetchSource(snapshot, file, files);

			if (contents === null) {
				return null;
			}
			const targets: SourceTokenTarget[] = [];
			const sourceByCrate = new Map((artifact.manifest.sources ?? []).flatMap((entry) => entry.crates.map((crate) => [crate, entry.crate] as const)));
			const aliasesByCanonical = new Map<string, string[]>();

			for (const [reachable, canonical] of Object.entries(artifact.index.paths)) {
				const aliases = aliasesByCanonical.get(canonical) ?? [];
				aliases.push(reachable);
				aliasesByCanonical.set(canonical, aliases);
			}

			for (const symbol of artifact.index.symbols) {
				if (!symbol.source) {
					continue;
				}

				const owner = sourceByCrate.get(symbol.crate) ?? source.crate;
				const ownerConfig = owner === source.crate ? source : options.config.framework.crates.find((candidate) => candidate.crate === owner);
				const ownerVersion = owner === source.crate ? version : ownerConfig?.versions.find((candidate) => candidate.releaseVersion.raw === artifact.manifest.sources?.find((entry) => entry.crate === owner)?.version);
				const target: SourceTokenTarget = {
					name: symbol.name,
					kind: symbol.kind,
					lens: semanticLens(symbol.kind),
					procMacro: symbol.procMacro?.kind ?? null,
					source: ownerConfig?.crate ?? source.crate,
					version: ownerVersion?.id ?? version.id,
					path: symbol.source.file,
					line: symbol.source.line,
					symbol: symbol.path,
					reachablePaths: aliasesByCanonical.get(symbol.path) ?? [symbol.path],
					docsHref: ownerConfig && ownerVersion ? `/docs/${ownerConfig.crate}/${ownerVersion.id}/symbols/${symbol.path.replaceAll('::', '/')}` : null,
					signature: symbol.signature,
					doc: symbol.doc,
					feature: symbol.feature,
					deprecated: symbol.deprecation?.note ?? symbol.deprecation?.since ?? null
				};

				targets.push(target);
			}

			const language = languageFor(file);
			const annotations = sourceAnnotations(contents, file, targets, artifact.index.externals?.symbols ?? []);

			return {
				kind: 'file',
				path: file,
				contents,
				language,
				repository: snapshot.repository,
				revision: snapshot.sha,
				githubHref: `${snapshot.repository}/blob/${snapshot.sha}/${encodePath(file)}`,
				files: inventoryFiles,
				targets,
				markdownHtml: file.toLowerCase().endsWith('.md') ? await renderSourceMarkdown(contents) : '',
				markdownPath: file.toLowerCase().endsWith('.md') ? file : null,
				sourceHtml: await renderSourceCode(contents, language, annotations)
			};
		},
		loadSymbol: (source, version, path) => options.artifacts.getSymbolInfo(source, version, path)
	};
}

function sourceAnnotations(contents: string, file: string, targets: readonly SourceTokenTarget[], externals: readonly ExternalSymbol[]): SourceCodeAnnotation[] {
	const annotations: SourceCodeAnnotation[] = [];
	const imports = sourceImports(contents);
	let lineOffset = 0;

	for (const [lineIndex, line] of contents.split('\n').entries()) {
		let tokenOffset = 0;

		for (const token of tokenizeSource(line, targets, { file, line: lineIndex + 1, imports })) {
			if (token.target) {
				const target = token.target;

				annotations.push({
					start: lineOffset + tokenOffset,
					end: lineOffset + tokenOffset + token.text.length,
					href: `/docs/${target.source}/${target.version}/src/${target.path}#L${target.line}`,
					symbol: target.symbol,
					kind: target.kind,
					lens: target.lens,
					procMacro: target.procMacro,
					title: `${target.procMacro ? `${target.procMacro} procedural macro` : target.kind.replace('_', ' ')} · Click: definition · Command/Ctrl-click: documentation`,
					metadata: internalMetadata(target)
				});
			} else {
				const external = externalTarget(token.text, line, tokenOffset, externals);

				if (external) {
					annotations.push(externalAnnotation(external, token.text, lineOffset + tokenOffset));
				}
			}

			tokenOffset += token.text.length;
		}

		lineOffset += line.length + 1;
	}

	return annotations;
}

function sourceImports(contents: string): string[] {
	const imports: string[] = [];

	for (const match of contents.matchAll(/^\s*use\s+([^;]+);/gm)) {
		const body = match[1].trim();
		const open = body.indexOf('{');

		if (open === -1) {
			imports.push(body.replace(/\s+as\s+\w+$/, ''));

			continue;
		}

		const close = body.lastIndexOf('}');
		const prefix = body.slice(0, open);

		if (close > open) {
			for (const item of body.slice(open + 1, close).split(',')) {
				imports.push(`${prefix}${item.trim()}`.replace(/\s+as\s+\w+$/, ''));
			}
		}
	}

	return imports;
}

function internalMetadata(target: SourceTokenTarget): Record<string, string | null> {
	return {
		'data-symbol-signature': target.signature,
		'data-symbol-doc': target.doc,
		'data-symbol-feature': target.feature,
		'data-symbol-deprecated': target.deprecated,
		'data-symbol-source': `/docs/${target.source}/${target.version}/src/${target.path}#L${target.line}`,
		'data-symbol-docs': target.docsHref,
		'data-symbol-docs-title': 'Documentation'
	};
}

function externalTarget(text: string, line: string, offset: number, externals: readonly ExternalSymbol[]): ExternalSymbol | undefined {
	const name = text.replace(/!$/, '');
	const candidates = externals.filter((symbol) => symbol.name === name);
	const before = line.slice(0, offset);
	const derive = /#\s*\[\s*derive\s*\([^)]*$/.test(before);
	const attribute = /#\s*\[\s*$/.test(before);
	const bang = text.endsWith('!');
	const allowed = candidates.filter((symbol) =>
		derive ? symbol.kind === 'proc_derive' : attribute ? symbol.kind === 'proc_attribute' : bang ? symbol.kind.includes('macro') : /^[A-Z]/.test(name) && !symbol.kind.includes('macro')
	);

	return allowed.length === 1 ? allowed[0] : undefined;
}

function externalAnnotation(symbol: ExternalSymbol, text: string, start: number): SourceCodeAnnotation {
	const href = symbol.docsUrl ?? `https://crates.io/crates/${encodeURIComponent(symbol.crate.replaceAll('_', '-'))}`;

	return {
		start,
		end: start + text.length,
		href,
		symbol: symbol.path,
		kind: symbol.kind,
		lens: semanticLens(symbol.kind),
		procMacro: null,
		title: `${symbol.kind.replace('_', ' ')} · ${symbol.crate}`,
		metadata: {
			'class': 'external',
			'data-external': symbol.path,
			'data-external-kind': symbol.kind,
			'data-external-crate': symbol.crate,
			'data-external-doc': symbol.doc,
			'data-external-signature': symbol.signature,
			'rel': 'noreferrer'
		}
	};
}

async function fetchSource(snapshot: ArtifactSource, file: string, cache: Map<string, Promise<string | null>>): Promise<string | null> {
	const key = `${snapshot.repository}@${snapshot.sha}/${file}`;
	const existing = cache.get(key);

	if (existing) {
		return existing;
	}

	const loading = fetch(githubRawUrl(snapshot, file), {
		headers: { accept: 'text/plain' },
		signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS)
	}).then((response) => response.ok ? response.text() : null);
	cache.set(key, loading);

	try {
		return await loading;
	} catch (cause) {
		cache.delete(key);
		throw cause;
	}
}

async function fetchGithubTree(snapshot: ArtifactSource): Promise<readonly SourceFileEntry[]> {
	const coordinates = githubCoordinates(snapshot.repository);

	if (!coordinates) {
		throw new Error(`Source viewer only supports GitHub repositories: ${snapshot.repository}`);
	}

	const response = await fetch(`https://api.github.com/repos/${coordinates}/git/trees/${snapshot.sha}?recursive=1`, {
		headers: { accept: 'application/vnd.github+json', 'user-agent': 'upwell-docs-source-viewer' },
		signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS)
	});

	if (!response.ok) {
		throw new Error(`GitHub source inventory request failed with ${response.status}.`);
	}

	const body = await response.json() as { truncated?: boolean; tree?: { path?: string; type?: string; size?: number }[] };

	if (body.truncated) {
		throw new Error('GitHub truncated the repository source inventory.');
	}

	return (body.tree ?? [])
		.filter((entry): entry is { path: string; type: string; size: number } => entry.type === 'blob' && typeof entry.path === 'string' && typeof entry.size === 'number')
		.map((entry) => ({ path: entry.path, bytes: entry.size }))
		.sort((left, right) => left.path.localeCompare(right.path));
}

function githubRawUrl(snapshot: ArtifactSource, file: string): string {
	const coordinates = githubCoordinates(snapshot.repository);

	if (!coordinates) {
		throw new Error(`Source viewer only supports GitHub repositories: ${snapshot.repository}`);
	}

	return `https://raw.githubusercontent.com/${coordinates}/${snapshot.sha}/${encodePath(file)}`;
}

function githubCoordinates(repository: string): string | null {
	const url = new URL(repository);

	if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
		return null;
	}

	const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean);

	return parts.length === 2 ? parts.map(encodeURIComponent).join('/') : null;
}

function safeSourcePath(value: string, allowRoot = false): string | null {
	let decoded: string;

	try {
		decoded = decodeURIComponent(value);
	} catch {
		return null;
	}

	const segments = decoded.split('/');

	return (allowRoot && decoded === '') || (decoded !== '' && !decoded.includes('\\') && !decoded.includes('\0') && segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')) ? decoded : null;
}

function encodePath(file: string): string {
	return file.split('/').map(encodeURIComponent).join('/');
}

function isTextSource(file: string): boolean {
	return /(?:^|\/)(?:Cargo\.lock|Cargo\.toml|README(?:\.[^/]*)?|LICENSE(?:\.[^/]*)?|rust-toolchain(?:\.toml)?)$|\.(?:rs|toml|md|txt|json|ya?ml)$/i.test(file);
}

function languageFor(file: string): string {
	const extension = file.split('.').pop()?.toLowerCase();

	if (extension === 'rs') return 'rust';
	if (extension === 'toml') return 'toml';
	if (extension === 'json') return 'json';
	if (extension === 'yaml' || extension === 'yml') return 'yaml';

	return 'text';
}

function semanticLens(kind: string): SourceTokenTarget['lens'] {
	if (kind === 'method' || kind === 'assoc_fn' || kind === 'function') return 'callable';
	if (kind === 'macro' || kind === 'proc_macro' || kind.startsWith('proc_')) return 'macro';
	if (kind === 'variant' || kind === 'constant' || kind === 'assoc_const') return 'value';
	if (kind === 'module') return 'module';
	if (kind === 'struct_field') return 'field';

	return 'type';
}
