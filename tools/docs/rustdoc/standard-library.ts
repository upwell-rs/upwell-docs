/**
 * Enriches the external tier with the standard library's own documentation.
 *
 * The reduced tier knows that `String` is a struct in `alloc` and where to read about it. What it
 * cannot do is answer `message.len()`, or show what `Arc` is actually *for* — those need the real
 * records, and the real records exist: `rustup component add rust-docs-json` ships rustdoc JSON for
 * `std`, `core` and `alloc` in the same format the framework's own output uses.
 *
 * **Demand-driven, so the size stays honest.** std, core and alloc are ~16,000 public symbols
 * between them, and a documentation site for a web framework has no business carrying most of that.
 * Only the symbols the framework actually mentions are enriched — the set the external tier already
 * collected — plus the members of those types, which is what makes a method call resolvable. What
 * gets stored per symbol is a capped summary, a signature and a member list; no source spans, no
 * relations, no full documentation bodies.
 *
 * **Optional, and absent by default.** The component is not installed with a toolchain, so a fresh
 * clone will not have it, and a build without it must be no worse than a build before this file
 * existed. Everything here degrades to leaving the tier exactly as it was, with one line of advice
 * on stderr — the same way a missing artifact degrades to highlighting without annotation.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { documentationUrl, type ExternalMember, type ExternalSymbol } from './externals.ts';
import { renderSignature, renderType } from './signature.ts';
import { summarise } from './symbol.ts';
import { innerKind, isPublic, type RustdocCrate, SUPPORTED_FORMAT_VERSIONS } from './types.ts';

/** Member kinds worth carrying for an external type: the ones a snippet can write. */
const MEMBER_KINDS = new Set(['function', 'assoc_const', 'assoc_type']);

/** Where the component unpacks, relative to a toolchain's sysroot. */
export function standardLibraryDir(sysroot: string): string {
	return path.join(sysroot, 'share', 'doc', 'rust', 'json');
}

export interface EnrichmentResult {
	/** Enriched records, keyed by the path they already had in the external tier. */
	readonly enriched: ReadonlyMap<string, ExternalSymbol>;
	/** Why nothing was enriched, when nothing was. Reported once, never fatal. */
	readonly skipped: string | null;
}

/**
 * Reads the standard library and fills in what the reduced tier left out.
 *
 * `wanted` is the demand: the external paths already collected from the framework's own output.
 * Anything outside it is skipped without being parsed into a record, which is what keeps this from
 * doubling the artifact to describe types nobody mentions.
 */
export async function enrichFromStandardLibrary(
	sysroot: string,
	wanted: ReadonlyMap<string, ExternalSymbol>,
	crates: readonly string[]
): Promise<EnrichmentResult> {
	const directory = standardLibraryDir(sysroot);
	const enriched = new Map<string, ExternalSymbol>();
	let read = 0;

	for (const crate of crates) {
		const file = path.join(directory, `${crate}.json`);
		const contents = await readFile(file, 'utf8').catch(() => null);

		if (contents === null) {
			continue;
		}

		const doc = JSON.parse(contents) as RustdocCrate;

		if (!SUPPORTED_FORMAT_VERSIONS.includes(doc.format_version)) {
			return {
				enriched: new Map(),
				skipped:
					`${file} uses rustdoc JSON format version ${doc.format_version}, but this build reads ` +
					`${SUPPORTED_FORMAT_VERSIONS.join(', ')}. The installed rust-docs-json belongs to a different ` +
					'nightly than the one used for the framework. Reinstall it for the same toolchain:\n\n' +
					'  rustup component add rust-docs-json --toolchain nightly\n'
			};
		}

		enrich(doc, wanted, enriched);
		read += 1;
	}

	if (read === 0) {
		return {
			enriched: new Map(),
			skipped:
				`No standard library documentation under ${directory}.\n` +
				'External types will carry a path, a kind and a link, but no summary or members. Enable them with:\n\n' +
				'  rustup component add rust-docs-json --toolchain nightly\n'
		};
	}

	return { enriched, skipped: null };
}

/**
 * How many rounds of following alias and `Deref` targets to run.
 *
 * `AtomicU64` is `Atomic<u64>`; `Atomic` is not referenced by the framework at all, so the demand
 * set does not contain it and it has to be pulled in. One round of following would be enough for
 * that case, and a couple covers an alias to a wrapper of an alias.
 */
const MAX_FOLLOW_ROUNDS = 3;

/**
 * Fills in the records one standard-library crate can answer for.
 *
 * Two things are collected: the symbols the framework mentions, and the symbols *those* lead to. A
 * type alias is a dead end without its target — `fetch_add` belongs to `Atomic`, not to the
 * `AtomicU64` a snippet writes — and nothing in the framework's own output ever names the target, so
 * demand alone would never reach it.
 */
function enrich(doc: RustdocCrate, wanted: ReadonlyMap<string, ExternalSymbol>, into: Map<string, ExternalSymbol>): void {
	const idsByPath = new Map<string, string>();
	const idsByName = new Map<string, string>();

	for (const [id, summary] of Object.entries(doc.paths)) {
		const path = summary.path.join('::');
		const name = summary.path[summary.path.length - 1];

		idsByPath.set(path, id);

		// First definition of a name wins, which for the standard library is the canonical one.
		if (!idsByName.has(name)) {
			idsByName.set(name, id);
		}
	}

	/** What to describe next: the item's id, and the record the tier already has for it. */
	let frontier: { id: string; base: ExternalSymbol }[] = [];

	for (const [id, summary] of Object.entries(doc.paths)) {
		const path = summary.path.join('::');

		// A primitive is written out by hand under its bare name — `u64`, not `core::u64` — because
		// rustdoc files it under a module. Its *members* still come from here, so the bare name is
		// looked up too, and that is what makes `name.len()` resolvable on a `str`.
		const existing = wanted.get(path) ?? (summary.kind === 'primitive' ? wanted.get(summary.path[summary.path.length - 1]) : undefined);

		if (existing && !into.has(existing.path)) {
			frontier.push({ id, base: existing });
		}
	}

	for (let round = 0; round < MAX_FOLLOW_ROUNDS && frontier.length > 0; round += 1) {
		const next: { id: string; base: ExternalSymbol }[] = [];

		for (const { id, base } of frontier) {
			const item = doc.index[id];

			if (!item || into.has(base.path)) {
				continue;
			}

			const kind = innerKind(item);
			const inner = kind ? item.inner[kind] : undefined;
			const aliasOf = kind === 'type_alias' ? renderType((inner as { type?: unknown }).type) : null;
			const derefTarget = kind ? derefTargetOf(doc, inner) : null;

			into.set(base.path, {
				...base,
				doc: summarise(item.docs),
				signature: kind ? renderSignature(item, kind) : null,
				members: kind ? [...membersOf(doc, inner), ...variantsOf(doc, kind, inner)] : [],
				derefTarget,
				aliasOf
			});

			// Whatever this type stands for has the members a reader will actually reach.
			for (const target of [aliasOf, derefTarget]) {
				const followed = target ? follow(target, doc, idsByPath, idsByName, into) : undefined;

				if (followed) {
					next.push(followed);
				}
			}
		}

		frontier = next;
	}
}

/**
 * The record for a type an alias or `Deref` points at, if this crate defines it and it is new.
 *
 * The target is rendered — `Atomic<u64>` — so its head is taken and looked up by name. A name is
 * enough here in a way it is not across the whole dependency tree: this is one crate of the standard
 * library, resolving a target its own item named.
 */
function follow(
	target: string,
	doc: RustdocCrate,
	idsByPath: ReadonlyMap<string, string>,
	idsByName: ReadonlyMap<string, string>,
	into: ReadonlyMap<string, ExternalSymbol>
): { id: string; base: ExternalSymbol } | undefined {
	const head = /^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*/.exec(target.replace(/^&\s*(mut\s+)?/, ''))?.[0];
	const id = head ? (idsByPath.get(head) ?? idsByName.get(head)) : undefined;
	const summary = id ? doc.paths[id] : undefined;

	if (!id || !summary) {
		return undefined;
	}

	const path = summary.path.join('::');
	const external = doc.external_crates[String(summary.crate_id)];

	if (into.has(path)) {
		return undefined;
	}

	return {
		id,
		base: {
			path,
			name: summary.path[summary.path.length - 1],
			kind: summary.kind,
			crate: external?.name ?? summary.path[0],
			docsUrl: documentationUrl(summary.path, summary.kind, external?.html_root_url)
		}
	};
}

/**
 * The variants an external enum declares.
 *
 * A variant is written qualified — `Ordering::Relaxed` — which is exactly the shape a member lookup
 * handles, and it is how half of the standard library's small enums are used. They come from the
 * enum's own item rather than from an impl, which is why they are collected separately.
 */
function variantsOf(doc: RustdocCrate, kind: string, inner: unknown): ExternalMember[] {
	if (kind !== 'enum') {
		return [];
	}

	const variants = (inner as { variants?: number[] } | undefined)?.variants ?? [];
	const collected: ExternalMember[] = [];

	for (const id of variants) {
		const item = doc.index[String(id)];

		if (!item?.name || !isPublic(item)) {
			continue;
		}

		collected.push({
			name: item.name,
			kind: 'variant',
			signature: item.name,
			doc: summarise(item.docs),
			// A variant evaluates to the enum itself, which is what lets a chain continue past it.
			returns: null
		});
	}

	return collected;
}

/**
 * The members of a type, from its inherent impls.
 *
 * Trait impls are skipped for the same reason they are in the framework's own index: `impl Clone for
 * String` would contribute `String::clone`, which says nothing except that `String` is cloneable,
 * and every type in the standard library implements a dozen traits. What a snippet writes is
 * `message.len()`, and `len` is inherent.
 */
function membersOf(doc: RustdocCrate, inner: unknown): ExternalMember[] {
	const impls = (inner as { impls?: number[] } | undefined)?.impls ?? [];
	const collected: (ExternalMember & { subject: string })[] = [];
	const seen = new Set<string>();

	for (const implId of impls) {
		const block = doc.index[String(implId)]?.inner?.impl as
			| { trait?: unknown; for?: unknown; items?: number[]; blanket_impl?: unknown; is_synthetic?: boolean }
			| undefined;

		if (!block || block.trait || block.blanket_impl || block.is_synthetic) {
			continue;
		}

		const subject = renderType(block.for);

		for (const memberId of block.items ?? []) {
			const item = doc.index[String(memberId)];
			const kind = item ? innerKind(item) : undefined;

			// Deduplicated per impl rather than per type: the same name in two impls is two different
			// members, which is the whole reason the subject is recorded.
			if (!item?.name || !kind || !MEMBER_KINDS.has(kind) || !isPublic(item) || seen.has(`${subject}::${item.name}`)) {
				continue;
			}

			seen.add(`${subject}::${item.name}`);
			collected.push({
				name: item.name,
				// `method` and `assoc_fn` are separated for the same reason the framework's index
				// separates them: only one can be reached through a value.
				kind: kind === 'function' ? (hasReceiver(item.inner.function) ? 'method' : 'assoc_fn') : kind,
				signature: renderSignature(item, kind),
				doc: summarise(item.docs),
				returns: returnTypeOf(item, kind),
				subject
			});
		}
	}

	// The subject is only worth storing where it disambiguates. For the ordinary type with one impl
	// it would be the type's own name repeated on every member.
	const contested = new Set(
		collected.filter((member, at) => collected.findIndex((other) => other.name === member.name) !== at).map((member) => member.name)
	);

	return collected
		.map((member) => (contested.has(member.name) ? member : { ...member, subject: undefined }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** The type an access to a member evaluates to: a function's output, an associated constant's type. */
function returnTypeOf(item: { inner: Record<string, unknown> }, kind: string): string | null {
	if (kind === 'assoc_const') {
		return renderType((item.inner.assoc_const as { type?: unknown } | undefined)?.type);
	}

	const output = (item.inner.function as { sig?: { output?: unknown } } | undefined)?.sig?.output;

	return output ? renderType(output) : null;
}

/**
 * The target of a type's `Deref` impl, if it has one.
 *
 * The single trait impl this reads, and only because Rust's own method lookup reads it too. It is
 * found by name rather than by resolving the trait's path: `Deref` is unambiguous in the standard
 * library, and matching the associated type `Target` inside it is what carries the answer.
 */
function derefTargetOf(doc: RustdocCrate, inner: unknown): string | null {
	const impls = (inner as { impls?: number[] } | undefined)?.impls ?? [];

	for (const implId of impls) {
		const block = doc.index[String(implId)]?.inner?.impl as
			| { trait?: { path?: string } | null; items?: number[]; blanket_impl?: unknown }
			| undefined;

		if (!block?.trait || block.blanket_impl || block.trait.path?.split('::').pop() !== 'Deref') {
			continue;
		}

		for (const memberId of block.items ?? []) {
			const item = doc.index[String(memberId)];

			if (item?.name === 'Target') {
				return renderType((item.inner.assoc_type as { type?: unknown } | undefined)?.type);
			}
		}
	}

	return null;
}

function hasReceiver(inner: unknown): boolean {
	const sig = (inner as { sig?: { inputs?: [string, unknown][] } } | undefined)?.sig;

	return sig?.inputs?.[0]?.[0] === 'self';
}
