import type { DocsConfig, DocsVersion, FrameworkCrateCoordinates } from '@upwell/docs-core/config';
import type { SymbolInfo } from '@upwell/docs-ui/types';
import type { ArtifactSource } from '@upwell/docs-tools/artifact/schema';
import { renderSourceCode, type SourceCodeAnnotation } from '@upwell/docs-tools/render/highlight';
import { createResolverIndex, readScope, resolveExpressions } from '@upwell/docs-tools/render/resolution';
import type { ExternalSymbol } from '@upwell/docs-tools/rustdoc/symbols';

import { tokenizeSource } from '../components/source-viewer/model.ts';
import type { ArtifactService } from './artifact.ts';
import { renderSourceMarkdown, type SourceMarkdownContext } from './markdown.ts';

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

export interface SourceCandidate {
	readonly symbol: string;
	readonly name: string;
	readonly kind: string;
	readonly href: string;
	readonly signature: string | null;
	readonly doc: string | null;
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
	/**
	 * The application's URL for one repository file, used to point a README's own links at the viewer.
	 *
	 * Optional, and the fallback is not a broken link: without it a relative link goes to the
	 * repository, which can serve any path in it.
	 */
	readonly fileHref?: (source: string, versionId: string, file: string) => string;
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
					markdownHtml: await renderSourceMarkdown(readmeContents, markdownLinks(options, snapshot, source, version, readme?.path ?? file)),
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
			const annotations = sourceAnnotations(contents, file, targets, artifact.index);

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
				markdownHtml: file.toLowerCase().endsWith('.md') ? await renderSourceMarkdown(contents, markdownLinks(options, snapshot, source, version, file)) : '',
				markdownPath: file.toLowerCase().endsWith('.md') ? file : null,
				sourceHtml: await renderSourceCode(contents, language, annotations)
			};
		},
		loadSymbol: (source, version, path) => options.artifacts.getSymbolInfo(source, version, path)
	};
}

function sourceAnnotations(contents: string, file: string, targets: readonly SourceTokenTarget[], index: Parameters<typeof createResolverIndex>[0]): SourceCodeAnnotation[] {
	const annotations: SourceCodeAnnotation[] = [];
	const scope = readScope(contents);
	const imports = [...scope.imports.values(), ...scope.globs.map((glob) => `${glob}::*`)];
	const expressions = resolveExpressions(contents, scope, createResolverIndex(index));
	const targetsBySymbol = new Map(targets.map((target) => [target.symbol, target]));
	let lineOffset = 0;

	for (const [lineIndex, line] of contents.split('\n').entries()) {
		let tokenOffset = 0;

		for (const token of tokenizeSource(line, targets, { file, line: lineIndex + 1, imports })) {
			const semantic = expressions.members.get(lineOffset + tokenOffset);
			const target = semantic ? targetsBySymbol.get(semantic.symbol.path) : token.target;
			const candidates = sourceCandidates(contents, file, lineIndex + 1, lineOffset + tokenOffset, token.text, targets, imports);

			if (candidates.length > 1) {
				annotations.push(ambiguousAnnotation(candidates, token.text, lineOffset + tokenOffset));
			} else if (target) {

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
				const external = externalTarget(token.text, line, tokenOffset, index.externals?.symbols ?? []);

				if (external) {
					annotations.push(externalAnnotation(external, token.text, lineOffset + tokenOffset));
				} else {
					if (candidates.length === 1) {
						annotations.push(targetAnnotation(candidates[0], token.text, lineOffset + tokenOffset));
					} else if (candidates.length > 1) {
						annotations.push(ambiguousAnnotation(candidates, token.text, lineOffset + tokenOffset));
					}
				}
			}

			tokenOffset += token.text.length;
		}

		lineOffset += line.length + 1;
	}

	return annotations;
}

function targetAnnotation(target: SourceTokenTarget, text: string, start: number): SourceCodeAnnotation {
	return {
		start,
		end: start + text.length,
		href: `/docs/${target.source}/${target.version}/src/${target.path}#L${target.line}`,
		symbol: target.symbol,
		kind: target.kind,
		lens: target.lens,
		procMacro: target.procMacro,
		title: target.kind.replace('_', ' '),
		metadata: internalMetadata(target)
	};
}

function sourceCandidates(
	contents: string,
	file: string,
	line: number,
	offset: number,
	text: string,
	targets: readonly SourceTokenTarget[],
	imports: readonly string[]
): SourceTokenTarget[] {
	const members = memberCandidates(contents, offset, text, targets, imports);

	if (members.length > 0) return members;
	const name = text.replace(/!$/, '');
	const sameName = targets.filter((target) => target.name === name);
	const declarations = sameName.filter((target) => target.path === file && target.line === line);

	if (declarations.length > 0) return deduplicate(declarations);
	const before = contents.slice(Math.max(0, contents.lastIndexOf('\n', offset - 1)), offset);
	const derive = /#\s*\[\s*derive\s*\([^)]*$/.test(before);
	const attribute = /#\s*\[\s*$/.test(before);
	const bang = text.endsWith('!');
	const syntax = sameName.filter((target) =>
		derive ? target.procMacro === 'derive' : attribute ? target.procMacro === 'attribute' : bang ? target.procMacro === 'bang' || target.kind === 'macro' : false
	);

	if (syntax.length === 0) return [];
	const scoped = syntax.filter((target) => target.reachablePaths.some((path) => imports.some((scope) => path.startsWith(scope.replace(/::\*$/, '::')))));

	return deduplicate(scoped.length > 0 ? scoped : syntax);
}

function ambiguousAnnotation(candidates: readonly SourceTokenTarget[], text: string, start: number): SourceCodeAnnotation {
	return {
		start,
		end: start + text.length,
		href: '#',
		symbol: '',
		kind: 'ambiguous',
		lens: 'ambiguous',
		procMacro: null,
		title: `${candidates.length} possible symbols`,
		metadata: {
			'class': 'ambiguous',
			'data-candidates': JSON.stringify(candidates.map(toCandidate))
		}
	};
}

function toCandidate(target: SourceTokenTarget): SourceCandidate {
	return {
		symbol: target.symbol,
		name: target.name,
		kind: target.kind,
		href: `/docs/${target.source}/${target.version}/src/${target.path}#L${target.line}`,
		signature: target.signature,
		doc: target.doc
	};
}

function memberCandidates(contents: string, offset: number, name: string, targets: readonly SourceTokenTarget[], imports: readonly string[]): SourceTokenTarget[] {
	const before = contents.slice(0, offset);
	const memberAccess = /\.\s*$/.test(before);
	const associated = /::\s*$/.test(before);

	if (!memberAccess && !associated) return [];
	const allowed = memberAccess ? new Set(['method', 'struct_field']) : new Set(['method', 'assoc_fn', 'assoc_const', 'assoc_type', 'variant']);
	let candidates = targets.filter((target) => target.name === name && allowed.has(target.kind));

	if (memberAccess) {
		const receiver = /([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/.exec(before)?.[1];
		const owners = receiver ? receiverOwners(contents, receiver, targets, imports) : [];

		if (owners.length === 0) return [];
		candidates = candidates.filter((target) => target.reachablePaths.some((path) => owners.some((owner) => path.startsWith(`${owner}::`))));
	} else {
		const owner = /([A-Za-z_][A-Za-z0-9_:]*)::\s*$/.exec(before)?.[1];

		if (!owner) return [];
		const owners = resolveTypeNames([owner], targets, imports);

		if (owners.length === 0) return [];
		candidates = candidates.filter((target) => target.reachablePaths.some((path) => owners.some((resolved) => path === `${resolved}::${name}`)));
	}

	const scoped = candidates.filter((target) => target.reachablePaths.some((path) => imports.some((scope) => path.startsWith(scope.replace(/::\*$/, '::')))));

	return deduplicate(scoped.length > 0 ? scoped : candidates);
}

function receiverOwners(contents: string, receiver: string, targets: readonly SourceTokenTarget[], imports: readonly string[]): string[] {
	const genericBounds = new Map<string, string[]>();

	for (const match of contents.matchAll(/\b([A-Z][A-Za-z0-9_]*)\s*:\s*([^,>{}]+)/g)) {
		genericBounds.set(match[1], splitBounds(match[2]));
	}

	const annotation = new RegExp(`\\b${escapeRegex(receiver)}\\s*:\\s*([^,)=;{]+)`).exec(contents)?.[1]?.trim();

	if (!annotation) return [];
	const generic = /^([A-Z][A-Za-z0-9_]*)$/.exec(annotation)?.[1];
	const writtenBounds = generic ? genericBounds.get(generic) ?? [] : /^(?:&\s*(?:mut\s*)?)?(?:dyn|impl)\s+(.+)$/.exec(annotation)?.[1];
	const names = Array.isArray(writtenBounds) ? writtenBounds : writtenBounds ? splitBounds(writtenBounds) : [annotation];

	return resolveTypeNames(names, targets, imports);
}

function splitBounds(value: string): string[] {
	return value.split('+').map((bound) => bound.trim().replace(/<.*$/, '')).filter((bound) => /^[A-Za-z_][A-Za-z0-9_:]*$/.test(bound));
}

function resolveTypeNames(names: readonly string[], targets: readonly SourceTokenTarget[], imports: readonly string[]): string[] {
	const resolved: string[] = [];

	for (const name of names) {
		const bare = name.split('::').at(-1);
		const candidates = targets.filter((target) => target.name === bare && (target.kind === 'trait' || target.kind === 'struct' || target.kind === 'enum' || target.kind === 'union' || target.kind === 'type_alias'));
		const scoped = candidates.filter((target) => target.reachablePaths.some((path) => path === name || imports.some((scope) => path.startsWith(scope.replace(/::\*$/, '::')))));

		for (const target of scoped.length > 0 ? scoped : candidates.length === 1 ? candidates : []) {
			resolved.push(...target.reachablePaths);
		}
	}

	return [...new Set(resolved)];
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deduplicate(targets: readonly SourceTokenTarget[]): SourceTokenTarget[] {
	return [...new Map(targets.map((target) => [target.symbol, target])).values()]
		.sort((left, right) => left.symbol.localeCompare(right.symbol));
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

/**
 * Resolves the links a repository Markdown file writes, relative to that file.
 *
 * Anything the viewer can display becomes a viewer URL so the reader stays in the site; everything
 * else — an image, a binary, a path outside the tree — goes to the repository at the same revision,
 * which can always serve it. A link that resolves nowhere is left to the renderer to reduce to its
 * label.
 */
function markdownLinks(
	options: SourceServiceOptions,
	snapshot: ArtifactSource,
	source: FrameworkCrateCoordinates,
	version: DocsVersion,
	from: string
): SourceMarkdownContext {
	const directory = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';

	return {
		resolveLink(url) {
			const hash = url.indexOf('#');
			const fragment = hash === -1 ? '' : url.slice(hash);
			const path = resolveRepositoryPath(directory, hash === -1 ? url : url.slice(0, hash));

			if (!path) {
				return null;
			}

			return isTextSource(path) && options.fileHref
				? `${options.fileHref(source.crate, version.id, encodePath(path))}${fragment}`
				: `${snapshot.repository}/blob/${snapshot.sha}/${encodePath(path)}${fragment}`;
		}
	};
}

/** Resolves a repository-relative URL against the directory of the file that wrote it. */
function resolveRepositoryPath(directory: string, url: string): string | null {
	if (url === '' || url.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
		return null;
	}

	const segments = url.startsWith('/') || directory === '' ? [] : directory.split('/');

	for (const segment of url.replace(/^\//, '').split('/')) {
		if (segment === '' || segment === '.') {
			continue;
		}

		if (segment === '..') {
			if (segments.length === 0) {
				return null;
			}

			segments.pop();

			continue;
		}

		segments.push(segment);
	}

	return segments.length > 0 ? segments.join('/') : null;
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
