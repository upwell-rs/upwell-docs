import type { SourceFileEntry, SourceTokenTarget } from '../../server/source.ts';

export interface SourceTreeRow {
	readonly path: string;
	readonly name: string;
	readonly kind: 'directory' | 'file';
	readonly depth: number;
}

export interface SourceToken {
	readonly text: string;
	readonly kind: string;
	readonly target?: SourceTokenTarget;
}

export const KEYWORDS = new Set([
	'as', 'async', 'await', 'const', 'crate', 'dyn', 'else', 'enum', 'extern', 'false', 'fn',
	'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref',
	'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe',
	'use', 'where', 'while'
]);

export function sourceBreadcrumbs(path: string): { readonly name: string; readonly path: string; readonly current: boolean }[] {
	return path.split('/').filter(Boolean).map((name, index, parts) => ({
		name,
		path: parts.slice(0, index + 1).join('/'),
		current: index === parts.length - 1
	}));
}

export function tokenizeSource(
	line: string,
	targets: readonly SourceTokenTarget[],
	location: { readonly file: string; readonly line: number; readonly imports?: readonly string[] }
): SourceToken[] {
	const byPath = new Map(targets.flatMap((target) => target.reachablePaths.map((path) => [path, target] as const)));
	const byName = new Map<string, SourceTokenTarget | null>();

	for (const target of targets) {
		byName.set(target.name, byName.has(target.name) ? null : target);
	}

	const tokens = [...line.matchAll(/\/\/.*$|r#*".*?"#*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])+'|\b\d[\d_]*\b|[A-Za-z_][A-Za-z0-9_]*!?|\s+|./g)].map(([text]): SourceToken => {
		if (text.startsWith('//')) return { text, kind: 'comment' };
		if (/^(?:r#*)?["']/.test(text)) return { text, kind: 'string' };
		if (/^\d/.test(text)) return { text, kind: 'number' };
		if (KEYWORDS.has(text)) return { text, kind: 'keyword' };

		return { text, kind: /^[A-Z]/.test(text) ? 'type' : 'plain' };
	});

	for (let index = 0; index < tokens.length; index += 1) {
		if (!isIdentifier(tokens[index].text)) continue;
		let path = tokens[index].text.replace(/!$/, '');
		let cursor = index;
		const first = byPath.get(path);

		if (first) tokens[index] = { ...tokens[index], kind: first.lens, target: first };

		while (tokens[cursor + 1]?.text === ':' && tokens[cursor + 2]?.text === ':' && isIdentifier(tokens[cursor + 3]?.text)) {
			cursor += 3;
			path += `::${tokens[cursor].text.replace(/!$/, '')}`;
			const target = byPath.get(path);

			if (target) tokens[cursor] = { ...tokens[cursor], kind: target.lens, target };
		}
	}

	for (let index = 0; index < tokens.length; index += 1) {
		const text = tokens[index].text;

		if (!isIdentifier(text) || tokens[index].target) continue;
		const name = text.replace(/!$/, '');
		const candidates = targets.filter((target) => target.name === name);
		const declarationKind = expectedDeclarationKind(line, text);
		const declarations = candidates.filter((target) => target.path === location.file && target.line === location.line);
		const exactDeclarations = declarationKind ? declarations.filter((target) => target.kind === declarationKind) : declarations;
		// Rust declares procedural macros with `fn` syntax, while rustdoc correctly classifies the
		// exported item as a macro. When source location leaves only one candidate, its semantic kind
		// is stronger evidence than the declaration keyword alone.
		const declaration = unique(exactDeclarations) ?? unique(declarations);
		const macro = macroTarget(tokens, index, candidates, location.imports ?? []);
		const type = /^[A-Z]/.test(text) ? unique(scoped(candidates.filter((target) => target.lens === 'type'), location.imports ?? [])) : undefined;
		const target = declaration ?? macro ?? type;

		if (target) tokens[index] = { ...tokens[index], kind: target.lens, target };
	}

	return tokens;
}

function expectedDeclarationKind(line: string, name: string): string | undefined {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const item = new RegExp(`\\b(struct|enum|trait|union|type|const|mod|fn)\\s+${escaped}\\b`).exec(line)?.[1];

	if (!item) return undefined;
	if (item === 'type') return 'type_alias';
	if (item === 'const') return 'constant';
	if (item === 'fn') return 'function';

	return item;
}

function scoped(candidates: readonly SourceTokenTarget[], imports: readonly string[]): readonly SourceTokenTarget[] {
	const matched = candidates.filter((target) => target.reachablePaths.some((path) => imports.some((scope) =>
		scope.endsWith('::*') ? path.startsWith(`${scope.slice(0, -3)}::`) : path === scope
	)));

	return matched.length > 0 ? matched : candidates;
}

function macroTarget(
	tokens: readonly SourceToken[],
	index: number,
	candidates: readonly SourceTokenTarget[],
	imports: readonly string[]
): SourceTokenTarget | undefined {
	const text = tokens[index].text;

	if (text.endsWith('!')) return unique(scoped(candidates.filter((target) => target.kind === 'macro' || target.procMacro === 'bang'), imports));

	const significant = tokens.map((token, position) => ({ text: token.text, position })).filter((token) => token.text.trim() !== '');
	const at = significant.findIndex((token) => token.position === index);
	const before = significant.slice(0, at).map((token) => token.text);
	const deriveAt = before.lastIndexOf('derive');
	const openAt = before.lastIndexOf('(');
	const closeAt = before.lastIndexOf(')');

	if (deriveAt >= 0 && openAt > deriveAt && closeAt < openAt) return unique(scoped(candidates.filter((target) => target.procMacro === 'derive'), imports));

	if (before.at(-1) === '[' && before.at(-2) === '#') return unique(scoped(candidates.filter((target) => target.procMacro === 'attribute'), imports));

	return undefined;
}

function unique<T>(values: readonly T[]): T | undefined {
	return values.length === 1 ? values[0] : undefined;
}

function isIdentifier(value: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*!?$/.test(value);
}

export function sourceTreeRows(paths: readonly string[], current: string, query: string, opened: ReadonlySet<string>): SourceTreeRow[] {
	const directories = new Set<string>();
	const files = new Set(paths);

	for (const path of paths) {
		const parts = path.split('/');

		for (let index = 1; index < parts.length; index += 1) directories.add(parts.slice(0, index).join('/'));
	}

	const wanted = query.trim().toLowerCase();
	const matching = wanted ? paths.filter((path) => path.toLowerCase().includes(wanted)) : paths;
	const visible = new Set<string>();

	for (const path of matching) {
		visible.add(path);
		const parts = path.split('/');

		for (let index = 1; index < parts.length; index += 1) visible.add(parts.slice(0, index).join('/'));
	}

	const rows: SourceTreeRow[] = [];
	const visit = (parent: string, depth: number): void => {
		const prefix = parent ? `${parent}/` : '';
		const children = [...visible].filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'));
		children.sort((left, right) => Number(files.has(left)) - Number(files.has(right)) || left.localeCompare(right));

		for (const path of children) {
			const kind = directories.has(path) ? 'directory' : 'file';
			rows.push({ path, name: path.slice(prefix.length), kind, depth });

			if (kind === 'directory' && (wanted || opened.has(path) || current.startsWith(`${path}/`))) visit(path, depth + 1);
		}
	};

	visit('', 0);

	return rows.slice(0, 800);
}

export function directSourceChildren(files: readonly SourceFileEntry[], directory: string): SourceTreeRow[] {
	const prefix = directory ? `${directory}/` : '';
	const children = new Map<string, SourceTreeRow>();

	for (const { path } of files) {
		if (!isViewableSource(path) || !path.startsWith(prefix)) continue;
		const remainder = path.slice(prefix.length);
		const [name, ...rest] = remainder.split('/');
		const childPath = `${prefix}${name}`;
		children.set(childPath, { path: childPath, name, kind: rest.length > 0 ? 'directory' : 'file', depth: 0 });
	}

	return [...children.values()].sort((left, right) => Number(left.kind === 'file') - Number(right.kind === 'file') || left.name.localeCompare(right.name));
}

export function isViewableSource(path: string): boolean {
	return /(?:^|\/)(?:Cargo\.lock|Cargo\.toml|README(?:\.[^/]*)?|LICENSE(?:\.[^/]*)?|rust-toolchain(?:\.toml)?)$|\.(?:rs|toml|md|txt|json|ya?ml)$/i.test(path);
}

export function encodeSourcePath(path: string): string {
	return path.split('/').map(encodeURIComponent).join('/');
}
