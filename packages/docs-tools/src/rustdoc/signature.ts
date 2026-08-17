/**
 * Renders rustdoc JSON type and item structures back into Rust-shaped signatures.
 *
 * rustdoc JSON gives structured types, not the rendered signature a reader wants to see on a hover
 * card, so it has to be printed. This is a *display* renderer: it aims to produce what a person
 * would recognise, not to round-trip. Anything it cannot render degrades to `_` rather than
 * throwing, because a slightly lossy signature is far better than no documentation at all — a
 * genuinely unknown shape is a display problem, not a build-breaking one.
 */

import type { RustdocItem } from "./types.ts";

interface AngleBracketedArgs {
  angle_bracketed: {
    args: unknown[];
    constraints: unknown[];
  };
}

interface ParenthesizedArgs {
  parenthesized: {
    inputs: unknown[];
    output: unknown | null;
  };
}

type GenericArgs = AngleBracketedArgs | ParenthesizedArgs | null;

/** Renders a rustdoc `Type`. */
export function renderType(type: unknown): string {
  if (type === null || type === undefined) {
    return "_";
  }

  if (type === "infer") {
    return "_";
  }

  if (typeof type !== "object") {
    return String(type);
  }

  const node = type as Record<string, unknown>;

  if ("resolved_path" in node) {
    const resolved = node.resolved_path as { path: string; args?: GenericArgs };

    return `${resolved.path}${renderGenericArgs(resolved.args ?? null)}`;
  }

  if ("generic" in node) {
    return String(node.generic);
  }

  if ("primitive" in node) {
    return String(node.primitive);
  }

  if ("borrowed_ref" in node) {
    const reference = node.borrowed_ref as {
      lifetime: string | null;
      is_mutable: boolean;
      type: unknown;
    };
    const lifetime = reference.lifetime ? `${reference.lifetime} ` : "";
    const mutability = reference.is_mutable ? "mut " : "";

    return `&${lifetime}${mutability}${renderType(reference.type)}`;
  }

  if ("raw_pointer" in node) {
    const pointer = node.raw_pointer as { is_mutable: boolean; type: unknown };

    return `*${pointer.is_mutable ? "mut" : "const"} ${renderType(pointer.type)}`;
  }

  if ("tuple" in node) {
    const members = (node.tuple as unknown[]).map(renderType);

    return members.length === 0 ? "()" : `(${members.join(", ")})`;
  }

  if ("slice" in node) {
    return `[${renderType(node.slice)}]`;
  }

  if ("array" in node) {
    const array = node.array as { type: unknown; len: string };

    return `[${renderType(array.type)}; ${array.len}]`;
  }

  if ("impl_trait" in node) {
    return `impl ${renderBounds(node.impl_trait as unknown[])}`;
  }

  if ("dyn_trait" in node) {
    const dynamic = node.dyn_trait as {
      traits: { trait: { path: string; args?: GenericArgs } }[];
      lifetime: string | null;
    };
    const traits = dynamic.traits.map(
      (entry) =>
        `${entry.trait.path}${renderGenericArgs(entry.trait.args ?? null)}`,
    );
    const lifetime = dynamic.lifetime ? [dynamic.lifetime] : [];

    return `dyn ${[...traits, ...lifetime].join(" + ")}`;
  }

  if ("qualified_path" in node) {
    const qualified = node.qualified_path as {
      name: string;
      self_type: unknown;
      trait: { path: string } | null;
    };
    const self = renderType(qualified.self_type);

    // An empty trait path is rustdoc's way of writing an unqualified projection: `D::Prepared`,
    // where the trait is inferred. Printing the `as` clause anyway produces `<D as >::Prepared`,
    // which is not Rust and reads as a rendering failure.
    if (!qualified.trait || qualified.trait.path === "") {
      return `${self}::${qualified.name}`;
    }

    return `<${self} as ${qualified.trait.path}>::${qualified.name}`;
  }

  if ("function_pointer" in node) {
    const pointer = node.function_pointer as {
      sig: { inputs: [string, unknown][]; output: unknown | null };
    };
    const inputs = pointer.sig.inputs.map(([, argument]) =>
      renderType(argument),
    );
    const output = pointer.sig.output
      ? ` -> ${renderType(pointer.sig.output)}`
      : "";

    return `fn(${inputs.join(", ")})${output}`;
  }

  return "_";
}

function renderGenericArgs(args: GenericArgs): string {
  if (!args) {
    return "";
  }

  if ("parenthesized" in args) {
    const inputs = args.parenthesized.inputs.map(renderType);
    const output = args.parenthesized.output
      ? ` -> ${renderType(args.parenthesized.output)}`
      : "";

    return `(${inputs.join(", ")})${output}`;
  }

  const rendered = args.angle_bracketed.args
    .map(renderGenericArg)
    .filter((entry) => entry !== "");

  return rendered.length === 0 ? "" : `<${rendered.join(", ")}>`;
}

function renderGenericArg(argument: unknown): string {
  if (typeof argument !== "object" || argument === null) {
    return "";
  }

  const node = argument as Record<string, unknown>;

  if ("type" in node) {
    return renderType(node.type);
  }

  if ("lifetime" in node) {
    return String(node.lifetime);
  }

  if ("const" in node) {
    const constant = node.const as { expr?: string; value?: string };

    return constant.expr ?? constant.value ?? "_";
  }

  return "";
}

function renderBounds(bounds: unknown[]): string {
  const rendered = bounds.map((bound) => {
    if (typeof bound !== "object" || bound === null) {
      return "";
    }

    const node = bound as Record<string, unknown>;

    if ("trait_bound" in node) {
      const traitBound = node.trait_bound as {
        trait: { path: string; args?: GenericArgs };
        modifier: string;
      };
      const prefix = traitBound.modifier === "maybe" ? "?" : "";

      return `${prefix}${traitBound.trait.path}${renderGenericArgs(traitBound.trait.args ?? null)}`;
    }

    if ("outlives" in node) {
      return String(node.outlives);
    }

    return "";
  });

  return rendered.filter((entry) => entry !== "").join(" + ");
}

/** Renders a generics clause, e.g. `<S, T: Clone>`. */
function renderGenericParams(generics: unknown): string {
  if (typeof generics !== "object" || generics === null) {
    return "";
  }

  const params = (generics as { params?: unknown[] }).params ?? [];
  const rendered: string[] = [];

  for (const param of params) {
    const node = param as { name: string; kind: Record<string, unknown> };
    const kind = Object.keys(node.kind ?? {})[0];

    if (kind === "lifetime") {
      rendered.push(node.name);

      continue;
    }

    if (kind === "type") {
      const details = node.kind.type as {
        bounds: unknown[];
        default: unknown | null;
        is_synthetic?: boolean;
      };

      // Synthetic parameters come from `impl Trait` in argument position and are already
      // visible in the rendered argument list; repeating them would be misleading.
      if (details.is_synthetic) {
        continue;
      }

      const bounds = renderBounds(details.bounds ?? []);
      const fallback = details.default
        ? ` = ${renderType(details.default)}`
        : "";

      rendered.push(`${node.name}${bounds ? `: ${bounds}` : ""}${fallback}`);

      continue;
    }

    if (kind === "const") {
      const details = node.kind.const as { type: unknown };

      rendered.push(`const ${node.name}: ${renderType(details.type)}`);
    }
  }

  return rendered.length === 0 ? "" : `<${rendered.join(", ")}>`;
}

/** Renders a `where` clause, or an empty string when there is nothing to say. */
function renderWhereClause(generics: unknown): string {
  if (typeof generics !== "object" || generics === null) {
    return "";
  }

  const predicates =
    (generics as { where_predicates?: unknown[] }).where_predicates ?? [];
  const rendered: string[] = [];

  for (const predicate of predicates) {
    const node = predicate as Record<string, unknown>;

    if ("bound_predicate" in node) {
      const bound = node.bound_predicate as {
        type: unknown;
        bounds: unknown[];
      };
      const bounds = renderBounds(bound.bounds);

      if (bounds !== "") {
        rendered.push(`${renderType(bound.type)}: ${bounds}`);
      }
    }
  }

  return rendered.length === 0 ? "" : ` where ${rendered.join(", ")}`;
}

/** How an item's context changes the way its signature is written. */
export interface SignatureOptions {
  /**
   * True for a member declared in a trait body.
   *
   * Trait members carry no visibility of their own — the trait's governs them — so rustdoc writes
   * them without `pub`, and printing one as `pub fn` would state something Rust does not allow.
   */
  readonly inTrait?: boolean;
  /**
   * Module name of the crate the item belongs to, e.g. `upwell_app`.
   *
   * rustdoc writes a type the crate refers to as `crate::Foo` as exactly that, which is meaningless
   * outside that crate — a reader cannot tell which crate, and the index cannot look it up.
   */
  readonly crateModule?: string;
}

/**
 * Replaces `crate::` with the module name of the crate the item came from.
 *
 * Textual because that is what the prefix is: rustdoc writes the path as the author wrote it, and
 * within a crate authors write `crate::`. There is nothing else in a rendered type that this pattern
 * can match — no strings, no comments — so the substitution is unambiguous.
 */
export function qualifyCrateRelative(
  rendered: string,
  crateModule: string | undefined,
): string {
  return crateModule
    ? rendered.replaceAll("crate::", `${crateModule}::`)
    : rendered;
}

/**
 * Renders an item's signature line.
 *
 * Only the shapes worth showing on a hover card are rendered; impl blocks and other structural
 * items return null, because their useful identity is the type they belong to, not a signature.
 */
export function renderSignature(
  item: RustdocItem,
  kind: string,
  options: SignatureOptions = {},
): string | null {
  const rendered = renderItem(item, kind, options);

  return rendered === null
    ? null
    : qualifyCrateRelative(rendered, options.crateModule);
}

function renderItem(
  item: RustdocItem,
  kind: string,
  options: SignatureOptions,
): string | null {
  const name = item.name ?? "_";
  const inner = item.inner[kind] as Record<string, unknown> | undefined;
  const visibility = options.inTrait ? "" : "pub ";

  if (!inner) {
    return null;
  }

  if (kind === "struct") {
    return `pub struct ${name}${renderGenericParams(inner.generics)}${renderWhereClause(inner.generics)}`;
  }

  if (kind === "enum") {
    return `pub enum ${name}${renderGenericParams(inner.generics)}${renderWhereClause(inner.generics)}`;
  }

  if (kind === "trait") {
    const unsafety = inner.is_unsafe ? "unsafe " : "";

    return `pub ${unsafety}trait ${name}${renderGenericParams(inner.generics)}${renderWhereClause(inner.generics)}`;
  }

  if (kind === "function") {
    return renderFunction(name, inner, visibility);
  }

  if (kind === "type_alias") {
    return `pub type ${name}${renderGenericParams(inner.generics)} = ${renderType(inner.type)}`;
  }

  if (kind === "constant") {
    const constant = inner as { type: unknown };

    return `pub const ${name}: ${renderType(constant.type)}`;
  }

  if (kind === "assoc_type") {
    return `type ${name}`;
  }

  if (kind === "assoc_const") {
    const constant = inner as { type: unknown };

    return `const ${name}: ${renderType(constant.type)}`;
  }

  if (kind === "module") {
    return `pub mod ${name}`;
  }

  if (kind === "macro") {
    return `macro_rules! ${name}`;
  }

  if (kind === "proc_macro") {
    const procMacro = inner as { kind?: unknown };

    if (procMacro.kind === "bang") {
      return `${name}!`;
    }

    if (procMacro.kind === "derive") {
      return `#[derive(${name})]`;
    }

    if (procMacro.kind === "attr") {
      return `#[${name}]`;
    }

    return null;
  }

  if (kind === "variant") {
    return name;
  }

  if (kind === "struct_field") {
    return `${name}: ${renderType(inner)}`;
  }

  return null;
}

function renderFunction(
  name: string,
  inner: Record<string, unknown>,
  visibility: string,
): string {
  const sig = inner.sig as {
    inputs: [string, unknown][];
    output: unknown | null;
    is_c_variadic: boolean;
  };
  const header = (inner.header ?? {}) as {
    is_const?: boolean;
    is_unsafe?: boolean;
    is_async?: boolean;
  };

  const qualifiers = [
    header.is_const ? "const" : "",
    header.is_async ? "async" : "",
    header.is_unsafe ? "unsafe" : "",
  ].filter((entry) => entry !== "");

  const inputs = sig.inputs.map(([argumentName, argumentType]) =>
    renderArgument(argumentName, argumentType),
  );
  const variadic = sig.is_c_variadic ? [...inputs, "..."] : inputs;
  const output = sig.output ? ` -> ${renderType(sig.output)}` : "";

  return `${visibility}${qualifiers.length > 0 ? `${qualifiers.join(" ")} ` : ""}fn ${name}${renderGenericParams(inner.generics)}(${variadic.join(", ")})${output}${renderWhereClause(inner.generics)}`;
}

/** `self` receivers are rendered as written rather than as `self: &Self`. */
function renderArgument(name: string, type: unknown): string {
  if (name !== "self") {
    return `${name}: ${renderType(type)}`;
  }

  const rendered = renderType(type);

  if (rendered === "Self") {
    return "self";
  }

  if (rendered === "&Self") {
    return "&self";
  }

  if (rendered === "&mut Self") {
    return "&mut self";
  }

  return `self: ${rendered}`;
}
