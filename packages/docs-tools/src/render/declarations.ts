/**
 * The items a snippet defines for itself.
 *
 * Documentation examples are mostly *not* made of framework types. A getting-started snippet declares
 * a `Greeter`, gives it a method, and then uses it — and until now every one of those names rendered
 * as inert text, because the resolver only knew what the framework contains. The reader was left with
 * the framework half of the example annotated and their own half blank, which is backwards: the
 * types the example invents are the ones they have never seen before.
 *
 * So a snippet is read for its own declarations first, and those join the framework symbols for the
 * rest of the pass. `struct Greeter { name: String }` makes `Greeter` a type with a field, so
 * `greeter.name` resolves; `impl Greeter { fn greet(&self) }` makes `self` meaningful inside it and
 * `greeter.greet()` resolvable outside it.
 *
 * These are **local** symbols and are marked as such. A local declaration never links to a symbol
 * page — there is none, and there should not be — but it does link to where it is declared, which is
 * the thing a reader actually wants: jumping from a use of `Greeter` back to the three lines that
 * define it, without leaving the page.
 *
 * This is a reader of Rust's *shape*, not of Rust. It recognises the item headers documentation
 * snippets are built from and ignores everything else; a construct it does not know simply
 * contributes no declaration, which costs an annotation rather than producing a wrong one.
 */

import type { Symbol } from "../rustdoc/symbols.ts";

/** Where a declaration is, so a use of it can point back. */
export interface Declaration {
  readonly name: string;
  readonly kind: Symbol["kind"];
  /** Offset of the declared name within the snippet. */
  readonly offset: number;
  /** The line the declaration appears on, 1-based, for anchoring a link. */
  readonly line: number;
  /** Rendered header, e.g. `struct Greeter`, for the hover card. */
  readonly signature: string;
  /** Doc comment above it, if the snippet has one. */
  readonly doc: string | null;
  /** For a member, the type it belongs to. */
  readonly owner?: string;
  /** For a function or field, the type it evaluates to. */
  readonly returns: string | null;
  /**
   * Id of the block this was declared in.
   *
   * Absent while a block reads its own declarations — it is the current block by definition. Set
   * when a declaration is handed to a *sibling* block of the same `<Example>`, which is what lets a
   * use in one block jump to a definition in another.
   */
  readonly block?: string;
}

/** An item header this reader understands, and the symbol kind it produces. */
const ITEM_KINDS: Record<string, Symbol["kind"]> = {
  struct: "struct",
  enum: "enum",
  trait: "trait",
  fn: "function",
  type: "type_alias",
  const: "constant",
  mod: "module",
  union: "struct",
};

/** Matches an item header and captures its keyword and name. */
const ITEM =
  /^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?(?:async[ \t]+|unsafe[ \t]+|const[ \t]+|extern[ \t]+"[^"]*"[ \t]+)*(struct|enum|trait|fn|type|const|mod|union)[ \t]+([A-Za-z_][A-Za-z0-9_]*)/;

/** Matches an `impl` header, capturing the type it is for — the last path before `{` or `where`. */
const IMPL =
  /^[ \t]*impl(?:<[^>]*>)?[ \t]+(?:.+?[ \t]+for[ \t]+)?([A-Za-z_][A-Za-z0-9_:]*)/;

/** Matches a struct field: `pub name: Type,` at one level of indentation. */
const FIELD =
  /^[ \t]+(?:pub(?:\([^)]*\))?[ \t]+)?([a-z_][A-Za-z0-9_]*)[ \t]*:[ \t]*(.+?),?[ \t]*$/;

/** Matches an enum variant: a capitalised bare name, optionally with a payload. */
const VARIANT = /^[ \t]+([A-Z][A-Za-z0-9_]*)[ \t]*(?:[({,]|$)/;

/** Matches a function's return type, so a local method can continue a chain. */
const RETURNS = /->[ \t]*([^{;]+)/;

/**
 * Reads every item a snippet declares.
 *
 * Line-based rather than a parser, because the shapes that matter are all line-initial in formatted
 * Rust, and documentation snippets are formatted. Brace depth is tracked only well enough to know
 * whether a line sits inside a `struct` body, an `impl` body, or at the top level, since that is the
 * only context a header's meaning depends on.
 */
export function readDeclarations(code: string): Map<string, Declaration> {
  const declarations = new Map<string, Declaration>();
  const lines = code.split("\n");
  const offsets = lineOffsets(lines);

  /** The type whose body the reader is currently inside, and what kind of body it is. */
  let container: { name: string; body: "type" | "impl" } | undefined;
  let containerDepth = 0;
  let depth = 0;
  let comment: string[] = [];

  for (const [at, line] of lines.entries()) {
    const documentation = /^[ \t]*\/\/\/[ \t]?(.*)$/.exec(line);

    if (documentation) {
      comment.push(documentation[1]);

      continue;
    }

    const opened = count(line, "{");
    const closed = count(line, "}");
    const item = ITEM.exec(line);
    const impl = !item && IMPL.exec(line);

    if (item) {
      const [, keyword, name] = item;
      const owner = container?.name;

      record(declarations, {
        name,
        // A `fn` inside an `impl` is a member of that type, and whether it is a method or an
        // associated function is decided by its first parameter exactly as in the index.
        kind:
          owner && keyword === "fn"
            ? hasSelfReceiver(line)
              ? "method"
              : "assoc_fn"
            : ITEM_KINDS[keyword],
        offset: offsets[at] + line.indexOf(name, line.indexOf(keyword)),
        line: at + 1,
        signature: line.trim().replace(/[ \t]*\{[ \t]*$/, ""),
        doc: comment.length > 0 ? comment.join(" ").trim() : null,
        owner,
        returns: returnType(line),
      });

      // A `struct`/`enum` header with a brace opens a body whose lines are fields or variants.
      if (
        opened > closed &&
        (keyword === "struct" ||
          keyword === "enum" ||
          keyword === "trait" ||
          keyword === "union")
      ) {
        container = { name, body: "type" };
        containerDepth = depth;
      }
    } else if (impl) {
      container = { name: impl[1].split("::").pop() ?? impl[1], body: "impl" };
      containerDepth = depth;
    } else if (container?.body === "type" && depth === containerDepth + 1) {
      readTypeBodyLine(
        line,
        at,
        offsets,
        container.name,
        comment,
        declarations,
      );
    }

    depth += opened - closed;

    if (container && depth <= containerDepth && (closed > 0 || opened > 0)) {
      container = undefined;
    }

    comment = [];
  }

  return declarations;
}

/** A line inside a `struct` or `enum` body: a field or a variant. */
function readTypeBodyLine(
  line: string,
  at: number,
  offsets: readonly number[],
  owner: string,
  comment: readonly string[],
  declarations: Map<string, Declaration>,
): void {
  const field = FIELD.exec(line);
  const doc = comment.length > 0 ? comment.join(" ").trim() : null;

  if (field) {
    record(declarations, {
      name: field[1],
      kind: "struct_field",
      offset: offsets[at] + line.indexOf(field[1]),
      line: at + 1,
      signature: line.trim().replace(/,$/, ""),
      doc,
      owner,
      returns: field[2].replace(/,$/, "").trim(),
    });

    return;
  }

  const variant = VARIANT.exec(line);

  if (variant) {
    record(declarations, {
      name: variant[1],
      kind: "variant",
      offset: offsets[at] + line.indexOf(variant[1]),
      line: at + 1,
      signature: line.trim().replace(/,$/, ""),
      doc,
      owner,
      returns: null,
    });
  }
}

/**
 * Adds a declaration, keyed by the path a use of it would be written as.
 *
 * A member is keyed under its owner (`Greeter::greet`), matching how the framework index keys one,
 * so a single lookup answers for both. The first declaration of a name wins: a snippet that declares
 * the same name twice is showing a before and an after, and the first is the one being explained.
 */
function record(
  declarations: Map<string, Declaration>,
  declaration: Declaration,
): void {
  const key = declaration.owner
    ? `${declaration.owner}::${declaration.name}`
    : declaration.name;

  if (!declarations.has(key)) {
    declarations.set(key, declaration);
  }
}

/** Whether a function's parameter list starts with a receiver, making it a method. */
function hasSelfReceiver(line: string): boolean {
  const parameters = /\(([^)]*)/.exec(line);

  return /^[ \t]*[&]?[ \t]*(?:mut[ \t]+)?self\b/.test(parameters?.[1] ?? "");
}

function returnType(line: string): string | null {
  const returns = RETURNS.exec(line);

  return returns ? returns[1].trim() : null;
}

/** Byte offset each line starts at, so a declaration can be located in the whole snippet. */
function lineOffsets(lines: readonly string[]): number[] {
  const offsets: number[] = [];
  let at = 0;

  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }

  return offsets;
}

function count(line: string, character: string): number {
  let total = 0;

  for (const found of line) {
    if (found === character) {
      total += 1;
    }
  }

  return total;
}
