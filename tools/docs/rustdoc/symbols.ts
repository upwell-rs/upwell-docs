/**
 * Builds the symbol index from rustdoc JSON.
 *
 * The index is what gives an authored code snippet meaning: a token in a page resolves to a symbol,
 * and the symbol carries its kind, signature, documentation, source location and relations. The
 * framework repository does not participate in this — it only has to have good `///` docs.
 *
 * Two path spaces exist and both matter:
 *
 * - the **canonical** path, where an item is defined (`upwell_core::scope::Singleton`)
 * - **alias** paths, where a reader actually meets it (`upwell::Singleton`, `upwell::prelude::Singleton`)
 *
 * Aliases come from walking the facade crate's module tree and following its `pub use` items.
 * Authors write facade paths, so aliases are what page references and snippet tokens resolve
 * against, while the canonical path stays the symbol's identity.
 *
 * Two collectors feed it, because rustdoc records the two halves of a crate's surface differently:
 * module-level items are found through `doc.paths`, and members are found by walking impl blocks —
 * see `members.ts`.
 */

import { collectExternals, type ExternalIndex, type ExternalSymbol, freezeExternals } from './externals.ts';
import { collectImplRelations, emptyRelations, expandMemberAliases, type ImplRelations } from './members.ts';
import { qualifyCrateRelative, renderSignature, renderType } from './signature.ts';
import { summarise, type Symbol, SYMBOL_KINDS, type SymbolKind } from './symbol.ts';
import { assertSupportedFormat, innerKind, isPublic, type RustdocCrate, type RustdocItem } from './types.ts';

export type { ExternalIndex, ExternalMember, ExternalSymbol } from './externals.ts';
export type { Symbol, SymbolDeprecation, SymbolKind, SymbolSource } from './symbol.ts';
export { MEMBER_SYMBOL_KINDS, SYMBOL_KINDS } from './symbol.ts';

export interface SymbolIndex {
	readonly symbols: readonly Symbol[];
	/** Every path — canonical and alias — mapped to the canonical path it identifies. */
	readonly paths: Readonly<Record<string, string>>;
	/** Bare name mapped to every canonical path with that name, for resolving snippet tokens. */
	readonly names: Readonly<Record<string, readonly string[]>>;
	/**
	 * Symbols the framework refers to but does not define — see `externals.ts`.
	 *
	 * A reduced tier: path, kind, crate and documentation URL, and nothing else. Indexing these
	 * crates properly is not possible (554 in the tree) and would not be useful; knowing that `Arc`
	 * is a struct in `std` and where it is documented is.
	 */
	readonly externals: ExternalIndex;
}

/** One crate's rustdoc JSON, with the Cargo package name it belongs to. */
export interface RustdocInput {
	/** Cargo package name, e.g. `framework-core`. */
	readonly crate: string;
	/** Path of the JSON file, used only in error messages. */
	readonly file: string;
	readonly doc: RustdocCrate;
}

export interface BuildOptions {
	/** Cargo package name of the facade crate whose re-exports define the alias space. */
	readonly facadeCrate: string;
	/**
	 * Facade feature that enables each crate, e.g. `framework-http` -> `http`.
	 *
	 * Derived from the facade's Cargo features rather than from rustdoc, because this workspace does
	 * not use the nightly `doc_cfg` attribute that would put the requirement in rustdoc's output.
	 */
	readonly cratesByFeature: Readonly<Record<string, string>>;
	/**
	 * Crate names the workspace depends on directly, as module names.
	 *
	 * Used only to judge ambiguity in the external tier — see `externals.ts`.
	 */
	readonly directDependencies?: readonly string[];
	/**
	 * Every crate the workspace contains, as Cargo package names.
	 *
	 * Decides what counts as "ours" when classifying a re-export target. Taken from the workspace
	 * rather than from the rustdoc inputs, because the inputs exclude unpublished members and a crate
	 * missing from this set has its items mistaken for another project's. Passing the workspace means
	 * adding a crate needs no change here.
	 */
	readonly workspaceCrates?: readonly string[];
}

/** Rust module name for a Cargo package name (`framework-core` -> `framework_core`). */
function moduleName(crate: string): string {
	return crate.replaceAll('-', '_');
}

export function buildSymbolIndex(inputs: readonly RustdocInput[], options: BuildOptions): SymbolIndex {
	const symbols = new Map<string, MutableSymbol>();
	const relations = emptyRelations();
	const externals = new Map<string, ExternalSymbol>();
	const edges: AliasEdge[] = [];

	for (const input of inputs) {
		assertSupportedFormat(input.file, input.doc);
	}

	for (const input of inputs) {
		const feature = options.cratesByFeature[input.crate] ?? null;

		collectCanonical(input, feature, symbols);
		collectImplRelations(input.doc, input.crate, feature, relations);
		collectExternals(input.doc, externals);
	}

	for (const input of inputs) {
		collectAliasEdges(input, edges);
	}

	const externalAliases = new Map<string, string>();
	const frameworkModules = new Set((options.workspaceCrates ?? inputs.map((input) => input.crate)).map(moduleName));
	const paths = resolveAliases(symbols, edges, externalAliases, frameworkModules);

	// Members join after the type alias space has settled, because each one is reachable at every
	// path its owner is — which is not known until the fixed point is reached.
	adoptMembers(symbols, relations);
	expandMemberAliases(relations.members, paths);
	attachRelations(symbols, relations);

	return freeze(symbols, paths, freezeExternals(externals, options.directDependencies, externalAliases));
}

/**
 * A symbol while it is being built.
 *
 * Aliases are tracked during resolution but not stored: the `paths` map already records every path
 * a symbol is reachable at, and the per-symbol list would be the same information a second time.
 */
interface MutableSymbol extends Omit<Symbol, 'implementations' | 'implementors' | 'derefTarget'> {
	aliases: string[];
	implementations: string[];
	implementors: string[];
	derefTarget: string | null;
}

/**
 * Collects every public, named item a crate defines.
 *
 * `paths` is the authority on an item's fully qualified path; items absent from it are unreachable
 * (private, or structural like impl blocks) and are skipped rather than guessed at. Members are the
 * documented exception — rustdoc omits most of them from `paths`, so `members.ts` finds those.
 */
function collectCanonical(input: RustdocInput, feature: string | null, symbols: Map<string, MutableSymbol>): void {
	const { doc } = input;
	const crateModule = moduleName(input.crate);

	for (const [id, item] of Object.entries(doc.index)) {
		const summary = doc.paths[id];
		const kind = innerKind(item);

		if (!summary || !item.name || !kind || !isPublic(item)) {
			continue;
		}

		if (!SYMBOL_KINDS.includes(kind as SymbolKind)) {
			continue;
		}

		const path = summary.path.join('::');

		// A crate can appear in more than one input when features overlap; first definition wins,
		// and they are identical by construction.
		if (symbols.has(path)) {
			continue;
		}

		symbols.set(path, {
			path,
			name: item.name,
			kind: kind as SymbolKind,
			crate: input.crate,
			signature: renderSignature(item, kind, { crateModule }),
			doc: summarise(item.docs),
			source: toSource(item),
			deprecation: item.deprecation,
			aliases: [],
			feature,
			returns: null,
			implementations: [],
			implementors: [],
			derefTarget: null,
			aliasOf: kind === 'type_alias'
				? qualifyCrateRelative(renderType((item.inner.type_alias as { type?: unknown }).type), crateModule)
				: null
		});
	}
}

/**
 * Adds the members found in impl blocks to the index.
 *
 * The impl walk wins over anything `doc.paths` produced for the same path. rustdoc gives a path to a
 * few members and not to the rest — `AppBuilder::prepare` has one, `AppBuilder::build` does not —
 * and the record made from a path entry alone cannot tell a method from an associated function or
 * say what it returns, because neither is knowable without the impl block. Preferring the walk is
 * what stops two members of the same type being described differently by an accident of which one
 * rustdoc happened to list.
 */
function adoptMembers(symbols: Map<string, MutableSymbol>, relations: ImplRelations): void {
	for (const [path, member] of relations.members) {
		symbols.set(path, {
			...member,
			aliases: symbols.get(path)?.aliases ?? [],
			implementations: [],
			implementors: [],
			derefTarget: null,
			aliasOf: null
		});
	}
}

/** Attaches the two directions of the impl graph to the symbols they describe. */
function attachRelations(symbols: Map<string, MutableSymbol>, relations: ImplRelations): void {
	for (const [path, traits] of relations.traitsByType) {
		const symbol = symbols.get(path);

		if (symbol) {
			symbol.implementations = [...traits].sort((a, b) => a.localeCompare(b));
		}
	}

	for (const [path, target] of relations.derefTargets) {
		const symbol = symbols.get(path);

		if (symbol) {
			symbol.derefTarget = target;
		}
	}

	for (const [path, types] of relations.implementors) {
		const symbol = symbols.get(path);

		// Only traits this workspace defines get implementors. A trait from `core` is implemented all
		// over the framework, and listing that on a page the site does not have is not a fact anyone
		// asked for.
		if (symbol) {
			symbol.implementors = [...types].sort((a, b) => a.localeCompare(b));
		}
	}
}

function toSource(item: RustdocItem): Symbol['source'] {
	if (!item.span) {
		return null;
	}

	return { file: item.span.filename, line: item.span.begin[0] };
}

/** One `pub use`, as a path-to-path rewrite. */
interface AliasEdge {
	/** Path the re-export makes the item reachable at. For a glob, the module prefix. */
	readonly alias: string;
	/** Path exactly as written in the `use`, which may be crate-relative and may itself be a re-export. */
	readonly source: string;
	/** Module the `use` was written in, needed to interpret a relative source. */
	readonly prefix: string;
	/** Crate module the `use` belongs to, needed to interpret `crate::` and crate-relative sources. */
	readonly crateModule: string;
	readonly isGlob: boolean;
	/**
	 * The item the `use` actually names, resolved through rustdoc's own id.
	 *
	 * This is authoritative where `source` is a guess. rustdoc records the path as the author wrote
	 * it — `super::axum::extract::Path` — but it also records the *id* of the item that names
	 * resolves to, and `paths` maps that id to a fully qualified path with the crate it belongs to.
	 * Reading it removes the need to try candidate spellings, and it is the only way to see a
	 * re-export whose target is in another crate at all.
	 */
	readonly target?: { readonly path: string; readonly external: boolean };
}

/**
 * Paths a `use` source could mean, most specific first.
 *
 * rustdoc records the path as the author wrote it, so a source is only fully qualified when it
 * crosses a crate boundary. Within a crate it is relative — usually to the crate root, sometimes to
 * the containing module — and may use `crate::`, `self::` or `super::`. Rather than parse Rust's
 * name resolution, each plausible reading is tried against the paths already known, which is
 * unambiguous in practice because the candidates live in disjoint namespaces.
 */
function sourceCandidates(edge: AliasEdge): string[] {
	const source = edge.source.replace(/^self::/, '');

	if (source.startsWith('crate::')) {
		return [`${edge.crateModule}::${source.slice('crate::'.length)}`];
	}

	if (source.startsWith('super::')) {
		const parent = edge.prefix.split('::').slice(0, -1).join('::');

		return [`${parent}::${source.slice('super::'.length)}`];
	}

	return [source, `${edge.prefix}::${source}`, `${edge.crateModule}::${source}`];
}

/**
 * Collects every `pub use` in a crate as an alias edge.
 *
 * Edges are gathered from *all* crates, not just the facade, because a facade re-export usually
 * names a sub-crate's own re-export rather than the defining path: `upwell` re-exports
 * `upwell_app::ToolingEndpoint`, which is itself `upwell_app`'s re-export of
 * `upwell_app::tooling::ToolingEndpoint`. Resolving one level would miss the majority of them.
 */
function collectAliasEdges(input: RustdocInput, edges: AliasEdge[]): void {
	const root = input.doc.index[String(input.doc.root)];

	if (root) {
		walkModule(input.doc, root, moduleName(input.crate), moduleName(input.crate), edges, new Set());
	}
}

function walkModule(
	doc: RustdocCrate,
	moduleItem: RustdocItem,
	prefix: string,
	crateModule: string,
	edges: AliasEdge[],
	seen: Set<number>
): void {
	const module = moduleItem.inner.module as { items: number[] } | undefined;

	if (!module || seen.has(moduleItem.id)) {
		return;
	}

	seen.add(moduleItem.id);

	for (const childId of module.items) {
		const child = doc.index[String(childId)];

		if (!child || !isPublic(child)) {
			continue;
		}

		const kind = innerKind(child);

		if (kind === 'module' && child.name) {
			walkModule(doc, child, `${prefix}::${child.name}`, crateModule, edges, seen);

			continue;
		}

		if (kind === 'use') {
			const use = child.inner.use as { source: string; name: string; is_glob: boolean; id?: number };
			const summary = use.id === undefined ? undefined : doc.paths[String(use.id)];

			edges.push({
				alias: use.is_glob ? prefix : `${prefix}::${use.name}`,
				source: use.source,
				prefix,
				crateModule,
				isGlob: use.is_glob,
				target: summary ? { path: summary.path.join('::'), external: summary.crate_id !== 0 } : undefined
			});
		}
	}
}

/** Cap on resolution passes, so a pathological re-export cycle cannot spin forever. */
const MAX_ALIAS_PASSES = 10;

/**
 * Resolves alias edges to a fixed point.
 *
 * Each pass rewrites the edges whose source is now a known path; because a re-export can name
 * another re-export, one pass is not enough, and the number of passes needed is the depth of the
 * re-export chain rather than anything predictable. Iterating until nothing changes is both simpler
 * and more correct than trying to order the crates.
 */
function resolveAliases(
	symbols: Map<string, MutableSymbol>,
	edges: readonly AliasEdge[],
	externals: Map<string, string>,
	frameworkModules: ReadonlySet<string>
): Map<string, string> {
	const paths = new Map<string, string>();

	for (const symbol of symbols.values()) {
		paths.set(symbol.path, symbol.path);
	}

	for (let pass = 0; pass < MAX_ALIAS_PASSES; pass += 1) {
		let added = 0;

		for (const edge of edges) {
			added += edge.isGlob ? expandGlob(edge, paths, externals) : expandDirect(edge, paths);
		}

		if (added === 0) {
			break;
		}
	}

	adoptExternalAliases(edges, paths, externals, frameworkModules);

	// Globs run again now that the external aliases exist, so a prelude re-exporting another crate's
	// type carries it to everything that globs the prelude.
	for (let pass = 0; pass < MAX_ALIAS_PASSES; pass += 1) {
		let added = 0;

		for (const edge of edges) {
			if (edge.isGlob) {
				added += expandGlob(edge, paths, externals);
			}
		}

		if (added === 0) {
			break;
		}
	}

	for (const [alias, canonical] of paths) {
		const symbol = symbols.get(canonical);

		if (symbol && alias !== canonical) {
			symbol.aliases.push(alias);
		}
	}

	return paths;
}

/**
 * Records the re-exports whose target is outside the framework entirely.
 *
 * Run once the framework's own paths have reached a fixed point, because that is the first moment
 * "not a framework symbol" means anything. rustdoc's `external` flag is relative to the crate being
 * read and is true for the workspace's own crates as well, so it says nothing on its own; a target
 * absent from `paths` after resolution has settled is genuinely somebody else's.
 */
function adoptExternalAliases(
	edges: readonly AliasEdge[],
	paths: ReadonlyMap<string, string>,
	externals: Map<string, string>,
	frameworkModules: ReadonlySet<string>
): void {
	for (const edge of edges) {
		if (edge.isGlob || !edge.target || paths.has(edge.alias) || externals.has(edge.alias)) {
			continue;
		}

		// A target in a workspace crate that the index simply does not carry — a `static`, say — is
		// not external; it is a framework item of a kind this build does not document. Recording it
		// as external would point a reader at docs.rs for a crate of the framework's own.
		if (paths.has(edge.target.path) || frameworkModules.has(edge.target.path.split('::')[0])) {
			continue;
		}

		externals.set(edge.alias, edge.target.path);
	}
}

function expandDirect(edge: AliasEdge, paths: Map<string, string>): number {
	if (paths.has(edge.alias)) {
		return 0;
	}

	// rustdoc's own id first, because it is an answer rather than a guess. Its `external` flag means
	// "another crate than the one being read", which includes the workspace's *own* crates — the
	// facade re-exports all of them — so it cannot be used to decide that a target is outside the
	// framework. Only failing to find the target among the framework's paths can, and that is not
	// knowable until the fixed point has settled. See `adoptExternalAliases`.
	if (edge.target) {
		const canonical = paths.get(edge.target.path);

		if (canonical) {
			paths.set(edge.alias, canonical);

			return 1;
		}
	}

	for (const candidate of sourceCandidates(edge)) {
		const canonical = paths.get(candidate);

		if (canonical) {
			paths.set(edge.alias, canonical);

			return 1;
		}
	}

	return 0;
}

/**
 * `pub use module::*` makes every direct child of the module reachable under the new prefix.
 *
 * Children that are themselves re-exports of another crate's items come along too. That is what lets
 * a snippet writing `use upwell::axum::prelude::*` mean axum's `Path` — the prelude re-exports it,
 * so the glob carries it, and the snippet's own imports become enough to say which `Path` is meant.
 */
function expandGlob(edge: AliasEdge, paths: Map<string, string>, externals: Map<string, string>): number {
	let added = 0;
	const sources = edge.target && !edge.target.external ? [edge.target.path, ...sourceCandidates(edge)] : sourceCandidates(edge);

	for (const candidate of sources) {
		const prefix = `${candidate}::`;

		added += expandInto(prefix, edge.alias, paths, paths);
		added += expandInto(prefix, edge.alias, externals, externals);
	}

	return added;
}

/** Copies the direct children of a prefix into the alias namespace. */
function expandInto(
	prefix: string,
	alias: string,
	source: ReadonlyMap<string, string>,
	target: Map<string, string>
): number {
	let added = 0;

	for (const [path, resolved] of [...source]) {
		if (!path.startsWith(prefix)) {
			continue;
		}

		const remainder = path.slice(prefix.length);

		if (remainder.includes('::')) {
			continue;
		}

		const aliased = `${alias}::${remainder}`;

		if (!target.has(aliased)) {
			target.set(aliased, resolved);
			added += 1;
		}
	}

	return added;
}

/** Sorts and indexes the collected symbols so the artifact is stable across runs. */
function freeze(symbols: Map<string, MutableSymbol>, paths: Map<string, string>, externals: ExternalIndex): SymbolIndex {
	const sorted = [...symbols.values()].sort((a, b) => a.path.localeCompare(b.path));
	const names: Record<string, string[]> = {};
	const stripped: Symbol[] = [];

	for (const symbol of sorted) {
		const record = { ...symbol } as Partial<MutableSymbol>;

		delete record.aliases;

		(names[symbol.name] ??= []).push(symbol.path);
		stripped.push(record as Symbol);
	}

	return {
		symbols: stripped,
		paths: Object.fromEntries([...paths].sort(([a], [b]) => a.localeCompare(b))),
		names,
		externals
	};
}
