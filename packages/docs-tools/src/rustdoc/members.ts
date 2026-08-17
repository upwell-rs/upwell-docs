/**
 * Everything the index learns from `impl` blocks and trait definitions.
 *
 * rustdoc's `paths` map is the authority on module-level items, and `symbols.ts` uses it as one. It
 * is not an authority on members: an inherent method exists in `index` with no entry in `paths` at
 * all, so a symbol like `App::builder` is invisible to a reader that only walks `paths`. Members
 * therefore have to be found by walking impl blocks and synthesising the path rustdoc did not
 * record.
 *
 * One pass over the impl blocks answers two questions at once, which is why they live together:
 *
 * - an **inherent** impl contributes its items as members of the type
 * - a **trait** impl contributes an edge — this type implements that trait — in both directions
 *
 * Members of a trait impl are deliberately *not* indexed. `impl Clone for App` would add `App::clone`
 * saying nothing except that the type derives `Clone`; the trait's own definition already documents
 * `clone`, and the fact worth recording is the edge. Doing otherwise multiplies the index by the
 * derive count and fills search with entries whose meaning is a shrug.
 */

import {
  qualifyCrateRelative,
  renderSignature,
  renderType,
} from "./signature.ts";
import { summarise, type Symbol, type SymbolKind } from "./symbol.ts";
import {
  innerKind,
  isPublic,
  type RustdocCrate,
  type RustdocItem,
} from "./types.ts";

/** Item kinds a member walk can contribute: impl and trait bodies, plus struct and enum bodies. */
const MEMBER_KINDS = new Set([
  "function",
  "assoc_const",
  "assoc_type",
  "struct_field",
  "variant",
]);

/**
 * What a walk over one crate's impl blocks produces.
 *
 * Accumulated across crates rather than returned per crate, because both relations cross crate
 * boundaries: a type in `framework-http` implements a trait defined in `framework-di`, and only the crate
 * holding the impl knows about it.
 */
export interface ImplRelations {
  /** Member symbols by their synthesised canonical path, e.g. `framework_app::app::App::builder`. */
  readonly members: Map<string, Symbol>;
  /** Canonical trait path mapped to the canonical paths of the types implementing it. */
  readonly implementors: Map<string, Set<string>>;
  /**
   * Canonical type path mapped to the trait names it implements, as written in the impl.
   *
   * Names rather than paths: this is what a type's page displays, and `Send` reads better than
   * `core::marker::Send`. The implementor direction keeps paths, because there it is an identity.
   */
  readonly traitsByType: Map<string, Set<string>>;
  /** Canonical type path mapped to what its `Deref` impl targets, as a rendered type. */
  readonly derefTargets: Map<string, string>;
}

export function emptyRelations(): ImplRelations {
  return {
    members: new Map(),
    implementors: new Map(),
    traitsByType: new Map(),
    derefTargets: new Map(),
  };
}

/**
 * Marker traits the compiler emits, which say nothing a reader wants to know.
 *
 * `StructuralPartialEq` comes from `#[derive(PartialEq)]` and is a genuine non-blanket impl, so the
 * blanket and synthetic filters do not catch it — but it is an implementation detail of the derive,
 * not a fact about the type. The derives themselves (`Clone`, `Debug`, `Eq`) are kept: those are
 * exactly what a reader checks for.
 */
const INTERNAL_TRAITS = new Set([
  "StructuralPartialEq",
  "StructuralEq",
  "Freeze",
  "CloneToUninit",
]);

/** The shape of an impl block, reduced to the fields this walk reads. */
interface ImplBlock {
  trait?: { path: string; id: number } | null;
  for?: unknown;
  items?: number[];
  blanket_impl?: unknown;
  is_synthetic?: boolean;
  is_negative?: boolean;
}

/**
 * Collects members and impl relations from one crate.
 *
 * Every impl block in the crate is visited rather than only those reachable from an indexed type,
 * because an impl is written in the crate that owns it and that is not always the crate that defines
 * the type. Blocks whose subject is not a named path — `impl Trait for &str`, for a tuple, for a
 * primitive — are skipped: there is no symbol to hang them on.
 */
export function collectImplRelations(
  doc: RustdocCrate,
  crate: string,
  feature: string | null,
  into: ImplRelations,
): void {
  const crateModule = crate.replaceAll("-", "_");

  for (const item of Object.values(doc.index)) {
    if (innerKind(item) !== "impl") {
      continue;
    }

    const block = item.inner.impl as ImplBlock | undefined;

    // Blanket impls (`impl<T> Into<U> for T`) and synthesised auto-trait impls apply to almost
    // everything, so recording them buries the two or three that characterise the type. A negative
    // impl states an absence, which is likewise noise on a documentation page.
    if (
      !block ||
      block.blanket_impl ||
      block.is_synthetic ||
      block.is_negative
    ) {
      continue;
    }

    const owner = pathOf(doc, subjectId(block.for));

    if (!owner) {
      continue;
    }

    if (block.trait) {
      recordImplementation(doc, block.trait, owner, into);

      // `Deref` is the one trait impl whose body matters: it is what Rust's own method lookup
      // follows, so the index has to follow it too.
      if (block.trait.path.split("::").pop() === "Deref") {
        const target = derefTargetOf(doc, block.items ?? [], crateModule);

        if (target) {
          into.derefTargets.set(owner, target);
        }
      }

      continue;
    }

    collectBody(
      doc,
      block.items ?? [],
      owner,
      crate,
      crateModule,
      feature,
      false,
      into,
    );
  }

  collectTraitBodies(doc, crate, crateModule, feature, into);
  collectTypeBodies(doc, crate, crateModule, feature, into);
}

/** The `Target` an impl of `Deref` names. */
function derefTargetOf(
  doc: RustdocCrate,
  items: readonly number[],
  crateModule: string,
): string | null {
  for (const id of items) {
    const item = doc.index[String(id)];

    if (item?.name === "Target") {
      return qualifyCrateRelative(
        renderType(
          (item.inner.assoc_type as { type?: unknown } | undefined)?.type,
        ),
        crateModule,
      );
    }
  }

  return null;
}

/**
 * Collects the fields a struct declares and the variants an enum declares.
 *
 * rustdoc puts a struct's fields in the struct's own item and gives them **no entry in `doc.paths`**
 * — the same omission that hides inherent methods, and a larger one in practice: a config struct is
 * mostly fields, and `AxumConfig` alone has thirteen that the path walk cannot see. Without this a
 * reader hovering `config.port` in a snippet gets nothing, on a type whose whole purpose is its
 * fields.
 *
 * Variants are collected here too. Most already arrive through `doc.paths`, but relying on that is
 * relying on a coincidence of rustdoc's output rather than on the enum that declares them.
 */
function collectTypeBodies(
  doc: RustdocCrate,
  crate: string,
  crateModule: string,
  feature: string | null,
  into: ImplRelations,
): void {
  for (const [id, item] of Object.entries(doc.index)) {
    const kind = innerKind(item);
    const owner = doc.paths[id]?.path.join("::");

    if (!owner || !isPublic(item)) {
      continue;
    }

    if (kind === "struct") {
      const plain = (
        item.inner.struct as { kind?: { plain?: { fields?: number[] } } }
      ).kind?.plain;

      collectBody(
        doc,
        plain?.fields ?? [],
        owner,
        crate,
        crateModule,
        feature,
        false,
        into,
      );

      continue;
    }

    if (kind === "enum") {
      collectBody(
        doc,
        (item.inner.enum as { variants?: number[] }).variants ?? [],
        owner,
        crate,
        crateModule,
        feature,
        false,
        into,
      );
    }
  }
}

/**
 * Records both directions of one trait implementation.
 *
 * The trait's identity comes from `doc.paths`, which resolves the impl's trait id even when the
 * trait belongs to another crate — that is what makes `framework_http::RequestContext implements
 * framework_di::Component` recordable from the crate that wrote the impl.
 */
function recordImplementation(
  doc: RustdocCrate,
  reference: { path: string; id: number },
  owner: string,
  into: ImplRelations,
): void {
  const name = reference.path.split("::").pop() ?? reference.path;

  if (INTERNAL_TRAITS.has(name)) {
    return;
  }

  add(into.traitsByType, owner, name);

  const traitPath = pathOf(doc, reference.id);

  if (traitPath) {
    add(into.implementors, traitPath, owner);
  }
}

/**
 * Collects the members a trait declares.
 *
 * Separate from the impl walk because a trait's own items hang off the trait item, not off an impl
 * block — and they are the members a reader actually looks up. `Component::configure` is documented
 * once, on the trait, however many types implement it.
 */
function collectTraitBodies(
  doc: RustdocCrate,
  crate: string,
  crateModule: string,
  feature: string | null,
  into: ImplRelations,
): void {
  for (const [id, item] of Object.entries(doc.index)) {
    if (innerKind(item) !== "trait" || !isPublic(item)) {
      continue;
    }

    const owner = doc.paths[id]?.path.join("::");
    const body = item.inner.trait as { items?: number[] } | undefined;

    if (!owner || !body?.items) {
      continue;
    }

    collectBody(
      doc,
      body.items,
      owner,
      crate,
      crateModule,
      feature,
      true,
      into,
    );
  }
}

/** Turns the item ids of an impl block or trait body into member symbols under `owner`. */
function collectBody(
  doc: RustdocCrate,
  items: readonly number[],
  owner: string,
  crate: string,
  crateModule: string,
  feature: string | null,
  inTrait: boolean,
  into: ImplRelations,
): void {
  for (const id of items) {
    const item = doc.index[String(id)];
    const kind = item ? innerKind(item) : undefined;

    if (
      !item ||
      !item.name ||
      !kind ||
      !MEMBER_KINDS.has(kind) ||
      !isPublic(item)
    ) {
      continue;
    }

    const path = `${owner}::${item.name}`;

    // A type can have several impl blocks, and a generic one may repeat a specialised member.
    // First definition wins; they document the same name either way.
    if (into.members.has(path)) {
      continue;
    }

    into.members.set(path, {
      path,
      name: item.name,
      kind: memberKind(item, kind),
      procMacro: null,
      crate,
      signature: renderSignature(item, kind, { inTrait, crateModule }),
      doc: summarise(item.docs),
      docs: item.docs,
      source: item.span
        ? { file: item.span.filename, line: item.span.begin[0] }
        : null,
      deprecation: item.deprecation,
      feature,
      returns: returnType(item, kind, crateModule),
      implementations: [],
      implementors: [],
      derefTarget: null,
      aliasOf: null,
    });
  }
}

/**
 * The type an access to this member evaluates to.
 *
 * For a function it is the return type; for a field it is the field's own type. Both are what an
 * expression continues from, which is why one field carries them: `config.tls.enabled` needs the
 * type of `tls` exactly as `App::builder().build()` needs the type of `build`.
 *
 * An `async fn` needs no unwrapping — rustdoc records the output a caller gets after awaiting, not
 * the opaque future — so what is stored is already the useful type.
 */
function returnType(
  item: RustdocItem,
  kind: string,
  crateModule: string,
): string | null {
  if (kind === "struct_field") {
    return qualifyCrateRelative(
      renderType(item.inner.struct_field),
      crateModule,
    );
  }

  if (kind !== "function") {
    return null;
  }

  const output = (
    item.inner.function as { sig?: { output?: unknown } } | undefined
  )?.sig?.output;

  return output ? qualifyCrateRelative(renderType(output), crateModule) : null;
}

/**
 * Whether a function member is called on a value or on the type.
 *
 * The distinction is the whole basis of resolving a member from a snippet: only a `method` can be
 * reached by `value.name()`, and only an `assoc_fn` by `Type::name()`. Recording it here means the
 * resolver never has to re-derive it from a signature string.
 */
function memberKind(item: RustdocItem, kind: string): SymbolKind {
  if (kind !== "function") {
    return kind as SymbolKind;
  }

  const sig = (
    item.inner.function as
      { sig?: { inputs?: [string, unknown][] } } | undefined
  )?.sig;

  return sig?.inputs?.[0]?.[0] === "self" ? "method" : "assoc_fn";
}

/** The id an impl's subject type resolves to, when it is a named path rather than a shape. */
function subjectId(subject: unknown): number | undefined {
  if (typeof subject !== "object" || subject === null) {
    return undefined;
  }

  const resolved = (subject as { resolved_path?: { id?: number } })
    .resolved_path;

  return resolved?.id;
}

function pathOf(doc: RustdocCrate, id: number | undefined): string | undefined {
  return id === undefined ? undefined : doc.paths[String(id)]?.path.join("::");
}

function add<T>(map: Map<string, Set<T>>, key: string, value: T): void {
  const existing = map.get(key);

  if (existing) {
    existing.add(value);

    return;
  }

  map.set(key, new Set([value]));
}

/**
 * Makes every member reachable through each alias of the type that owns it.
 *
 * A reader writes `framework::App::builder`, not `framework_app::app::App::builder`, and the alias table
 * built for types says nothing about what hangs off them. Extending it here — after type aliases
 * have reached their fixed point — is what lets a `<Symbol />` in prose name a member by the path
 * the documentation elsewhere uses for its owner.
 */
export function expandMemberAliases(
  members: ReadonlyMap<string, Symbol>,
  paths: Map<string, string>,
): void {
  const aliasesByCanonical = new Map<string, string[]>();

  for (const [alias, canonical] of paths) {
    if (alias === canonical) {
      continue;
    }

    const existing = aliasesByCanonical.get(canonical);

    if (existing) {
      existing.push(alias);
    } else {
      aliasesByCanonical.set(canonical, [alias]);
    }
  }

  for (const path of members.keys()) {
    const separator = path.lastIndexOf("::");
    const owner = path.slice(0, separator);
    const name = path.slice(separator + 2);

    paths.set(path, path);

    for (const alias of aliasesByCanonical.get(owner) ?? []) {
      const aliased = `${alias}::${name}`;

      if (!paths.has(aliased)) {
        paths.set(aliased, path);
      }
    }
  }
}
