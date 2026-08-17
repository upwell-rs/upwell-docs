/**
 * Destructuring patterns, which are how a large share of real Rust names its values.
 *
 * `let app = …` is the easy case and the least common one in framework documentation. What examples
 * actually write is `let (tx, rx) = channel()`, `let Config { port, .. } = config`, and handlers
 * taking `Json(payload): Json<T>` — and until a pattern is read, every name it binds is untyped, so
 * the code lens goes blank exactly where the example gets interesting.
 *
 * Three forms are read, chosen because they are the ones documentation uses:
 *
 * - **tuple** — `let (a, b) = …`, typed by splitting the initialiser's tuple type positionally
 * - **struct** — `let Config { port, .. } = …`, typed from the named type's own fields
 * - **tuple struct** — `let Json(payload) = …`, typed from the wrapper's first field
 *
 * A name a pattern binds by renaming (`Config { port: p }`) binds `p`, not `port`, which is the
 * distinction that stops a rename from quietly attributing the wrong type.
 *
 * Anything else — slice patterns, nested patterns, `@` bindings, or-patterns — contributes nothing
 * rather than a guess. An unannotated identifier is a non-event; a wrongly typed one is a lie.
 */

/** A `let` or parameter pattern, reduced to what typing it needs. */
export type Pattern =
  | { readonly kind: "name"; readonly name: string }
  /** `(a, b)` — each name takes the type at its position in the initialiser's tuple. */
  | { readonly kind: "tuple"; readonly names: readonly (string | undefined)[] }
  /** `Type { field, other: renamed }` — each name takes the type of the field it destructures. */
  | {
      readonly kind: "struct";
      readonly type: string;
      readonly fields: readonly PatternField[];
    }
  /** `Type(inner)` — the name takes the type of the wrapper's first field. */
  | {
      readonly kind: "tupleStruct";
      readonly type: string;
      readonly name: string;
    };

/** One field of a struct pattern: the field destructured, and the name it binds. */
export interface PatternField {
  /** The field as declared on the type. */
  readonly field: string;
  /** The name brought into scope, which differs from `field` when the pattern renames. */
  readonly binds: string;
  /** Offset of the field name in the snippet, so the field itself can be annotated. */
  readonly offset: number;
}

interface Token {
  readonly text: string;
  readonly offset: number;
  readonly isIdentifier: boolean;
}

export interface PatternRead {
  readonly pattern: Pattern | undefined;
  /** Index of the first token after the pattern. */
  readonly next: number;
}

/**
 * Reads one pattern.
 *
 * Bounded by its own brackets rather than by scanning to `=`, so a pattern in a parameter list stops
 * at the right place — there is no `=` to stop at there.
 */
export function readPattern(tokens: readonly Token[], at: number): PatternRead {
  let cursor = at;

  while (tokens[cursor]?.text === "mut" || tokens[cursor]?.text === "ref") {
    cursor += 1;
  }

  const token = tokens[cursor];

  if (!token) {
    return { pattern: undefined, next: cursor + 1 };
  }

  if (token.text === "(") {
    return readTuple(tokens, cursor);
  }

  if (!token.isIdentifier) {
    return { pattern: undefined, next: cursor + 1 };
  }

  // A path followed by a brace or a parenthesis is a type being destructured; a bare name is a
  // plain binding. `Json(payload)` and `payload` differ only in what comes next.
  const path = readPath(tokens, cursor);
  const opener = tokens[path.next]?.text;

  if (opener === "{") {
    return readStruct(tokens, path.next, path.name);
  }

  if (opener === "(" && /^[A-Z]/.test(path.name)) {
    return readTupleStruct(tokens, path.next, path.name);
  }

  if (path.segments > 1) {
    return { pattern: undefined, next: path.next };
  }

  return { pattern: { kind: "name", name: path.name }, next: path.next };
}

/** `(a, b, _)` — positional, with `_` and nested patterns contributing no name. */
function readTuple(tokens: readonly Token[], at: number): PatternRead {
  const names: (string | undefined)[] = [];
  let cursor = at + 1;
  let depth = 1;

  while (cursor < tokens.length && depth > 0) {
    const token = tokens[cursor];

    if (token.text === "(") {
      depth += 1;
      cursor += 1;

      continue;
    }

    if (token.text === ")") {
      depth -= 1;
      cursor += 1;

      continue;
    }

    if (token.text === ",") {
      cursor += 1;

      continue;
    }

    // Only a bare identifier at the top level binds a position. Anything else occupies the
    // position without giving it a name this can type.
    if (
      depth === 1 &&
      token.isIdentifier &&
      token.text !== "mut" &&
      token.text !== "ref"
    ) {
      const following = tokens[cursor + 1]?.text;

      names.push(
        following === "," || following === ")" ? token.text : undefined,
      );
    }

    cursor += 1;
  }

  return {
    pattern: names.length > 0 ? { kind: "tuple", names } : undefined,
    next: cursor,
  };
}

/** `Type { field, other: renamed, .. }`. */
function readStruct(
  tokens: readonly Token[],
  at: number,
  type: string,
): PatternRead {
  const fields: PatternField[] = [];
  let cursor = at + 1;
  let depth = 1;

  while (cursor < tokens.length && depth > 0) {
    const token = tokens[cursor];

    if (token.text === "{") {
      depth += 1;
      cursor += 1;

      continue;
    }

    if (token.text === "}") {
      depth -= 1;
      cursor += 1;

      continue;
    }

    if (depth === 1 && token.isIdentifier) {
      const renamed =
        tokens[cursor + 1]?.text === ":" && tokens[cursor + 2]?.isIdentifier;

      fields.push({
        field: token.text,
        binds: renamed ? tokens[cursor + 2].text : token.text,
        offset: token.offset,
      });

      cursor += renamed ? 3 : 1;

      continue;
    }

    cursor += 1;
  }

  return { pattern: { kind: "struct", type, fields }, next: cursor };
}

/** `Type(inner)` — only the single-field form, which is what a newtype wrapper is. */
function readTupleStruct(
  tokens: readonly Token[],
  at: number,
  type: string,
): PatternRead {
  const inner = tokens[at + 1];
  const closes = tokens[at + 2]?.text === ")";

  if (!inner?.isIdentifier || !closes) {
    return { pattern: undefined, next: at + 1 };
  }

  return {
    pattern: { kind: "tupleStruct", type, name: inner.text },
    next: at + 3,
  };
}

/** Reads a `::`-joined path, returning its last segment. */
function readPath(
  tokens: readonly Token[],
  at: number,
): { name: string; segments: number; next: number } {
  let cursor = at;
  let segments = 0;
  let name = "";

  while (tokens[cursor]?.isIdentifier) {
    name = tokens[cursor].text;
    segments += 1;

    if (tokens[cursor + 1]?.text !== "::") {
      cursor += 1;

      break;
    }

    cursor += 2;
  }

  return { name, segments, next: cursor };
}

/**
 * Splits a rendered tuple type into its element types.
 *
 * Returns nothing for anything that is not a tuple, so a `let (a, b) = …` whose initialiser turned
 * out to be a single value binds nothing rather than binding both names to it.
 */
export function tupleElements(rendered: string): string[] | undefined {
  const trimmed = rendered.trim();

  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
    return undefined;
  }

  const inner = trimmed.slice(1, -1);
  const elements: string[] = [];
  let depth = 0;
  let current = "";

  for (const character of inner) {
    if (character === "<" || character === "(" || character === "[") {
      depth += 1;
    }

    if (character === ">" || character === ")" || character === "]") {
      depth -= 1;
    }

    if (character === "," && depth === 0) {
      elements.push(current.trim());
      current = "";

      continue;
    }

    current += character;
  }

  if (current.trim() !== "") {
    elements.push(current.trim());
  }

  return elements.length > 1 ? elements : undefined;
}
