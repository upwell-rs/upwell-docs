/**
 * Resolves members written in a snippet: `app.serve()`, `App::builder()`, `config.port`.
 *
 * The bare-identifier resolver in `resolve.ts` matches a name against the index and stops there,
 * which is all a type reference needs. A member needs one thing more: what it is a member *of*.
 * `serve` means nothing on its own — it means something only once the receiver's type is known, and
 * that is a fact about the expression rather than about the token.
 *
 * So this is inference, but the smallest kind that pays for itself. There is no Rust compiler here
 * and there is not going to be one; what there is instead is the index, which records every member's
 * return type. That turns a builder chain into a lookup rather than a deduction: `App::builder()`
 * returns `AppBuilder`, so `.name()` after it is `AppBuilder::name`, which returns `Self`, so
 * `.build()` after *that* is `AppBuilder::build`. Each step is a map access.
 *
 * What it will not do is guess. A receiver whose type is not known resolves to nothing, and the
 * chain stops there rather than continuing on a hopeful assumption — an identifier that renders as
 * ordinary code is a non-event, and a hover card pointing at the wrong method is a lie.
 *
 * Where the type comes from, in order of how much the snippet had to say for itself:
 *
 * - an explicit annotation — `let app: App`, `fn serve(app: App)`, `|request: HttpRequest|`
 * - the return type of the call that produced it — `let app = App::builder().build()`
 * - a generic parameter's trait bound — `fn run<C: Component>(c: C)` makes `c` a `Component`
 * - the enclosing `impl` block, which is what `self` means
 * - the `new`/`default` convention, which is the one thing here that is assumed rather than read
 *
 * Two of Rust's own lookup rules are modelled, because without them ordinary code is a dead end:
 *
 * - **`Deref`** — a method called on an `Arc<App>` is usually a method on `App`, and Rust's method
 *   resolution follows the impl to find it. So does this, substituting the wrapper's type parameter
 *   from how the receiver was written.
 * - **conversion bounds** — `fn open(p: impl AsRef<Path>)` binds a value that is *not* a `Path`.
 *   The conversion is modelled where it is true, on the method: `p.as_ref()` is a `Path`, and
 *   `p.is_dir()` deliberately resolves to nothing, because it does not compile either.
 *
 * Results are keyed by byte offset in the snippet, because that is the only identity a token has:
 * `name` may appear six times in a snippet meaning six different things, and Shiki hands each
 * occurrence to the transformer with its offset.
 */

import type {
  ExternalMember,
  ExternalSymbol,
  Symbol,
} from "../rustdoc/symbols.ts";
import { type Declaration, readDeclarations } from "./declarations.ts";
import { type Pattern, readPattern, tupleElements } from "./patterns.ts";
import {
  externalFromScope,
  findExternal,
  type ResolvedToken,
  type ResolverIndex,
  resolveToken,
  type SnippetScope,
} from "./resolve.ts";

/** Member kinds this resolves. A bare identifier never reaches them; a qualified one always does. */
const MEMBER_KINDS = new Set([
  "method",
  "assoc_fn",
  "assoc_const",
  "assoc_type",
  "struct_field",
  "variant",
]);

/**
 * Associated functions conventionally returning the type that owns them.
 *
 * The one assumption in this file. Both are almost always provided by a trait impl — `Default::default`
 * — which the index deliberately does not carry members for, so without this a snippet opening
 * `let config = AxumConfig::default();` would know nothing about `config`. Rust's convention here is
 * strong enough to rely on, and the cost of being wrong is a link that should not have been made on
 * the *next* token rather than a wrong link on this one.
 */
const SELF_RETURNING = new Set(["new", "default"]);

/** Members reachable through the receiver rather than resolved: they leave the chain's type alone. */
const TRANSPARENT = new Set(["await"]);

/** Wrappers a chain reads straight through, because neither is a framework type worth stopping on. */
const TRANSPARENT_GENERICS = ["Result", "Option"];

/**
 * Conversion bounds, and the method each one is spent through.
 *
 * `fn open(path: impl AsRef<Path>)` is how a great deal of Rust is written, and the value it binds is
 * **not** a `Path` — it is something a `Path` can be borrowed from. Binding `path` to `Path` would
 * be a lie that resolves `path.join(…)`, which does not compile. What is true is narrower and more
 * useful: calling the bound's own method yields the target, so `path.as_ref()` is a `Path` and
 * everything after it resolves.
 *
 * The generic parameter itself stays bound to the trait, which is what it actually is.
 */
const CONVERSIONS: Record<string, string> = {
  AsRef: "as_ref",
  AsMut: "as_mut",
  Borrow: "borrow",
  BorrowMut: "borrow_mut",
  Into: "into",
  ToOwned: "to_owned",
};

/** A binding that can be converted into another type by calling one method on it. */
interface Conversion {
  /** The method that performs it, e.g. `as_ref`. */
  readonly method: string;
  /** The type it yields, as written in the bound. */
  readonly target: string;
}

interface Token {
  readonly text: string;
  readonly offset: number;
  readonly isIdentifier: boolean;
}

/**
 * Splits a snippet into identifiers and punctuation.
 *
 * Strings, characters and comments are dropped rather than tokenised: a doc comment describing
 * `app.serve()` must not produce a link, and neither must a string containing one. Lifetimes are
 * dropped for the same reason — `'a` is not a name anything can be a member of.
 */
function tokenise(code: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;

  while (at < code.length) {
    const character = code[at];

    if (character === "/" && code[at + 1] === "/") {
      at = lineEnd(code, at);

      continue;
    }

    if (character === "/" && code[at + 1] === "*") {
      const close = code.indexOf("*/", at + 2);

      at = close === -1 ? code.length : close + 2;

      continue;
    }

    if (
      character === '"' ||
      (character === "r" && (code[at + 1] === '"' || code[at + 1] === "#"))
    ) {
      at = stringEnd(code, at);

      continue;
    }

    if (character === "'") {
      at = quoteEnd(code, at);

      continue;
    }

    if (/[A-Za-z_]/.test(character)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(code.slice(at))![0];

      tokens.push({ text: match, offset: at, isIdentifier: true });
      at += match.length;

      continue;
    }

    if (/\s/.test(character)) {
      at += 1;

      continue;
    }

    const pair = code.slice(at, at + 2);

    if (pair === "::" || pair === "->" || pair === "=>") {
      tokens.push({ text: pair, offset: at, isIdentifier: false });
      at += 2;

      continue;
    }

    tokens.push({ text: character, offset: at, isIdentifier: false });
    at += 1;
  }

  return tokens;
}

function lineEnd(code: string, at: number): number {
  const newline = code.indexOf("\n", at);

  return newline === -1 ? code.length : newline;
}

/** End of a string literal, including the raw forms `r"…"` and `r#"…"#`. */
function stringEnd(code: string, at: number): number {
  if (code[at] === "r") {
    const hashes = /^r(#*)"/.exec(code.slice(at));

    if (!hashes) {
      return at + 1;
    }

    const terminator = `"${hashes[1]}`;
    const close = code.indexOf(terminator, at + hashes[0].length);

    return close === -1 ? code.length : close + terminator.length;
  }

  let cursor = at + 1;

  while (cursor < code.length) {
    if (code[cursor] === "\\") {
      cursor += 2;

      continue;
    }

    if (code[cursor] === '"') {
      return cursor + 1;
    }

    cursor += 1;
  }

  return code.length;
}

/** End of a character literal, or of a lifetime, which shares the opening quote. */
function quoteEnd(code: string, at: number): number {
  const lifetime = /^'[A-Za-z_][A-Za-z0-9_]*(?!')/.exec(code.slice(at));

  if (lifetime) {
    return at + lifetime[0].length;
  }

  const literal = /^'(\\.|[^'\\])'/.exec(code.slice(at));

  return at + (literal ? literal[0].length : 1);
}

/**
 * Punctuation after which the expression being read is finished and a new one begins.
 *
 * Arithmetic is deliberately **not** here. `let count = counter.fetch_add(1) + 1` has the type of
 * the call, and treating `+` as a boundary threw that away — which is most of what `let x = …` is
 * for. Nothing is risked by carrying it: an operand that names something resolves and replaces the
 * chain itself, so the only case the carry survives is a literal, where the type is unchanged.
 */
const RESETS = new Set([";", ",", "=", "{", "=>", "|", "<", ">", "&"]);

/**
 * Resolves every member reference in a snippet, keyed by the offset of the member's own identifier.
 *
 * A single left-to-right pass, carrying the type of the expression under construction. Bracketed
 * groups push that type and restore it on close, which is what lets an argument contain a chain of
 * its own — `serve(App::builder().build())` — without the inner chain being mistaken for a
 * continuation of the outer one.
 */
export function resolveExpressions(
  code: string,
  scope: SnippetScope,
  framework: ResolverIndex,
  /**
   * Declarations from the other blocks of the same `<Example>`, if this block is in one.
   *
   * Each carries the id of the block it came from, so a use here can still be jumped to — the
   * destination is simply a different block on the same page. They are kept separate from this
   * block's own declarations because only the latter are anchored to offsets in *this* code.
   */
  inherited?: ReadonlyMap<string, Declaration>,
): ResolvedExpressions {
  const declarations = readDeclarations(code);

  /**
   * Every name the snippet can resolve locally: its own, over anything inherited from a sibling
   * block of the same `<Example>`.
   *
   * Both the index and the rendering need this. An inherited declaration carries the id of the
   * block it came from, so a use of it still has somewhere to jump to — which is the whole reason
   * the two maps are kept distinguishable rather than merged at the source.
   */
  const annotations = inherited
    ? merged(inherited, declarations)
    : declarations;
  const index = withDeclarations(framework, annotations);
  const tokens = tokenise(code);
  const conversions = new Map<string, Conversion>();
  const bindings = readGenericBounds(code, scope, index, conversions);

  // Names that resolve to a type but are not values. Annotating `C` or `Self` as though it were a
  // local would say the opposite of what they are. `self` is excluded from this — it *is* a value,
  // and saying what it holds is useful in a long impl block.
  const typeParameters = new Set([...bindings.keys(), "Self"]);

  /**
   * What each occurrence was bound to *at the point the walk reached it*.
   *
   * Needed because one name can mean different types at different places, and `self` always does:
   * a snippet with two impl blocks rebinds it, and reading the final table would report the last
   * block's type for every `self` in the file. The walk knows the right answer as it goes, so it
   * records it per offset instead of being asked again afterwards.
   */
  const snapshots = new Map<number, string>();
  const externalMembers = new Map<number, ResolvedExternalMember>();

  /**
   * How each binding's type was *written*, generics and all.
   *
   * The binding table holds a canonical path, which is all a member lookup needs — until the lookup
   * has to follow `Deref`. `Arc<T>` dereferences to `T`, and only the written form says what `T`
   * was: `Arc<AtomicU64>` and `Arc<Mutex<u8>>` have the same canonical path and different targets.
   */
  const written = new Map<string, string>();
  const members = walk(
    tokens,
    scope,
    index,
    bindings,
    snapshots,
    externalMembers,
    written,
    conversions,
  );

  const declarationSites = new Map<number, Declaration>();

  for (const declaration of declarations.values()) {
    declarationSites.set(declaration.offset, declaration);
  }

  return {
    members,
    variables: findVariables(
      tokens,
      members,
      bindings,
      snapshots,
      typeParameters,
      index,
    ),
    externalMembers,
    declarations,
    declarationSites,
    annotations,
    index,
  };
}

/**
 * The framework index with the snippet's own declarations layered on top.
 *
 * A copy rather than a mutation: the framework index is shared by every code block in the build, and
 * a snippet's `Greeter` must not leak into the next page's snippets. Local names shadow framework
 * ones, which is what Rust does — a snippet that declares its own `Config` means that one.
 */
function withDeclarations(
  framework: ResolverIndex,
  declarations: ReadonlyMap<string, Declaration>,
): ResolverIndex {
  if (declarations.size === 0) {
    return framework;
  }

  const symbols = new Map(framework.symbols);
  const paths: Record<string, string> = { ...framework.paths };
  const names: Record<string, readonly string[]> = { ...framework.names };

  for (const [key, declaration] of declarations) {
    symbols.set(key, toSymbol(key, declaration));
    paths[key] = key;
    names[declaration.name] = [key];
  }

  // The external tier is carried through unchanged. It is a property of the framework's index, not
  // of this snippet, and dropping it here silently disabled external annotation for every snippet
  // that happened to declare something of its own.
  return { symbols, paths, names, externals: framework.externals };
}

/**
 * A snippet's declaration, shaped as a symbol so everything downstream treats it alike.
 *
 * `crate` is the marker: `LOCAL_CRATE` is not a crate the framework has, and it is what tells the
 * renderer this is a name the page invented rather than one it can link to a symbol page.
 */
function toSymbol(path: string, declaration: Declaration): Symbol {
  return {
    path,
    name: declaration.name,
    kind: declaration.kind,
    procMacro: null,
    crate: LOCAL_CRATE,
    signature: declaration.signature,
    doc: declaration.doc,
    docs: null,
    source: null,
    deprecation: null,
    feature: null,
    returns: declaration.returns,
    implementations: [],
    implementors: [],
    derefTarget: null,
    aliasOf: null,
  };
}

/** This block's declarations over the ones it inherited, since a local definition shadows. */
function merged(
  inherited: ReadonlyMap<string, Declaration>,
  own: ReadonlyMap<string, Declaration>,
): Map<string, Declaration> {
  return new Map([...inherited, ...own]);
}

/** Marks a symbol as declared by the snippet rather than by the framework. */
export const LOCAL_CRATE = "\0local";

/** Whether a symbol came from the snippet rather than from the framework. */
export function isLocal(symbol: Symbol): boolean {
  return symbol.crate === LOCAL_CRATE;
}

/** Members only, for callers that do not care what the variables turned out to be. */
export function resolveMembers(
  code: string,
  scope: SnippetScope,
  index: ResolverIndex,
): Map<number, ResolvedToken> {
  return resolveExpressions(code, scope, index).members;
}

/**
 * A variable whose type the snippet made knowable.
 *
 * Deliberately not a `ResolvedToken`: a variable is *not* a framework symbol, and presenting it as
 * one would be a lie — `app` is a local, and the thing worth saying about it is what type it has.
 * The symbol carried here is that type, not the token.
 */
/** A member of a type another crate defines. */
export interface ResolvedExternalMember {
  readonly owner: ExternalSymbol;
  readonly member: ExternalMember;
}

export interface ResolvedVariable {
  /** The variable as written, e.g. `app`. */
  readonly name: string;
  /** The type it holds, when the framework defines it. */
  readonly symbol?: Symbol;
  /**
   * The type it holds, when another crate defines it.
   *
   * `let (message, count) = greeter.greet()` gives `message` the type `String`, which is real
   * information even though this site documents neither `String` nor the crate it comes from. The
   * card then says `message: String` and links out, exactly as a bare `String` token would.
   */
  readonly external?: ExternalSymbol;
  /** The path to display for that type, preferring what the snippet itself brought into scope. */
  readonly path: string;
  /** Kind of the type, from whichever tier answered. */
  readonly kind: string;
  /** First paragraph of the type's documentation, when the framework defines it. */
  readonly doc?: string | null;
}

export interface ResolvedExpressions {
  /** Member references, keyed by the offset of the member's own identifier. */
  readonly members: Map<number, ResolvedToken>;
  /** Occurrences of a typed local, keyed by offset. */
  readonly variables: Map<number, ResolvedVariable>;
  /**
   * Members reached on a value whose type belongs to another crate, keyed by offset.
   *
   * `message.len()` where `message` is a `String`. Kept apart from `members` because the result is
   * not a framework symbol and must not be rendered as one — it links to that crate's own
   * documentation, exactly as the type itself does.
   */
  readonly externalMembers: Map<number, ResolvedExternalMember>;
  /** What the snippet declared for itself, keyed by the path a use of it would be written as. */
  readonly declarations: ReadonlyMap<string, Declaration>;
  /**
   * Where each of those declarations was written, keyed by the offset of its own name.
   *
   * So a declaration is marked as the thing it declares. Without it a field is coloured where it is
   * *used* and left plain where it is *defined*, which reads as two different things — and the
   * definition is where a reader most wants to be told what it is.
   */
  readonly declarationSites: Map<number, Declaration>;
  /**
   * The same, plus whatever a sibling block of the same `<Example>` declared.
   *
   * What rendering looks a resolved local up in: a name from another block of the example is still
   * a local, and still has a definition to point at — in that block rather than this one.
   */
  readonly annotations: ReadonlyMap<string, Declaration>;
  /**
   * The framework index with this snippet's declarations layered on.
   *
   * Returned because the caller resolves bare identifiers too, and has to do it against the same
   * index: resolving `Greeter` against the framework alone finds nothing, which is how a snippet's
   * own type ends up unannotated while its members are not.
   */
  readonly index: ResolverIndex;
}

function walk(
  tokens: readonly Token[],
  scope: SnippetScope,
  index: ResolverIndex,
  bindings: Map<string, string>,
  snapshots: Map<number, string>,
  externalMembers: Map<number, ResolvedExternalMember>,
  written: Map<string, string>,
  conversions: Map<string, Conversion>,
): Map<number, ResolvedToken> {
  const resolved = new Map<number, ResolvedToken>();
  /**
   * The chain suspended by a bracket, restored when it closes.
   *
   * Both halves are saved. Saving only the canonical path lost the rendered type across the `()` of
   * the very call that produced it, so `let (a, b) = thing.pair()` had nothing left to split.
   */
  const enclosing: {
    canonical: string | undefined;
    rendered: string | undefined;
  }[] = [];

  let chain: string | undefined;
  /**
   * The chain's type as *rendered*, kept beside its canonical path.
   *
   * A tuple has no canonical path — `(String, AxumConfig)` is not a symbol — so the path alone
   * cannot type `let (text, cfg) = …`. The rendered form is what a tuple pattern splits.
   */
  let chainRendered: string | undefined;
  /**
   * The binding the chain currently stands for, when it came from one.
   *
   * A conversion is a property of the *binding*, not of its type: `path: impl AsRef<Path>` says
   * something about `path`, and nothing about whatever type the bound resolved to.
   */
  let chainBinding: string | undefined;
  let pending: Pattern | undefined;
  let at = 0;

  const setChain = (
    canonical: string | undefined,
    rendered?: string,
    binding?: string,
  ) => {
    chain = canonical;
    chainRendered = rendered;
    chainBinding = binding;
  };

  while (at < tokens.length) {
    const token = tokens[at];

    if (!token.isIdentifier) {
      // A turbofish is punctuation in the middle of a call, not the end of one. Its `<` would
      // otherwise read as a comparison and discard the type the chain had just established.
      if (token.text === "::" && nextText(tokens, at) === "<") {
        at = skipAngles(tokens, at + 1);

        continue;
      }

      if (token.text === "(" || token.text === "[" || token.text === "{") {
        enclosing.push({ canonical: chain, rendered: chainRendered });
        setChain(undefined);
        at += 1;

        continue;
      }

      if (token.text === ")" || token.text === "]" || token.text === "}") {
        const restored = enclosing.pop();

        setChain(restored?.canonical, restored?.rendered);
        at += 1;

        continue;
      }

      if (token.text === ";") {
        bindPattern(pending, chain, chainRendered, index, bindings, resolved);
        pending = undefined;
        setChain(undefined);
        at += 1;

        continue;
      }

      if (RESETS.has(token.text)) {
        setChain(undefined);
      }

      at += 1;

      continue;
    }

    if (token.text === "let") {
      at = readBinding(
        tokens,
        at + 1,
        scope,
        index,
        resolved,
        bindings,
        snapshots,
        externalMembers,
        written,
        conversions,
        (found) => (pending = found),
      );

      continue;
    }

    // `impl Greeter { … }` — everything inside it can say `self`, which is the single most common
    // receiver in any snippet showing a type's own methods.
    if (token.text === "impl") {
      at = readImpl(tokens, at + 1, scope, index, bindings);

      continue;
    }

    // A struct body declares fields, not locals. `struct Greeter { app: App }` would otherwise read
    // as a binding, because a field and an annotated parameter are written identically — and the
    // snippet would then claim there is a local called `app` in scope, which there is not.
    if (
      token.text === "struct" ||
      token.text === "enum" ||
      token.text === "union"
    ) {
      at = skipBody(tokens, at + 1);

      continue;
    }

    // A member access: the identifier belongs to whatever the chain currently holds.
    if (previousText(tokens, at) === ".") {
      at = readMember(
        tokens,
        at,
        chain,
        chainRendered,
        chainBinding,
        conversions,
        scope,
        index,
        resolved,
        externalMembers,
        setChain,
      );

      continue;
    }

    // An annotated binding, wherever one can be written: `let x: T`, `fn f(x: T)`, `|x: T|`.
    if (
      nextText(tokens, at) === ":" &&
      startsBinding(previousText(tokens, at))
    ) {
      at = readAnnotation(
        tokens,
        at,
        scope,
        index,
        resolved,
        bindings,
        snapshots,
        externalMembers,
        written,
        conversions,
      );

      continue;
    }

    // A destructuring parameter: `fn handle(Json(body): Json<Payload>)`. The pattern names the
    // type it takes apart, so it types its bindings without the annotation being consulted — which
    // is what makes an extractor-style parameter readable at all.
    if (startsBinding(previousText(tokens, at)) && isPatternHead(tokens, at)) {
      const parameter = readPattern(tokens, at);
      // The annotation follows the pattern — `Path(who): Path<String>` — and its generic argument
      // is what a newtype extractor actually hands over.
      const annotated =
        tokens[parameter.next]?.text === ":"
          ? writtenType(tokens, parameter.next + 1)
          : undefined;

      bindPattern(
        parameter.pattern,
        undefined,
        annotated,
        index,
        bindings,
        resolved,
      );
      at = parameter.next;

      continue;
    }

    at = readPath(
      tokens,
      at,
      scope,
      index,
      resolved,
      bindings,
      snapshots,
      externalMembers,
      setChain,
      written,
    );
  }

  return resolved;
}

/**
 * Finds every occurrence of a local whose type is known.
 *
 * A second pass, because a `let` binding's type is only settled once its initialiser has been read —
 * and the declaration site is exactly where a reader most wants to be told what the variable is.
 * Walking again once the bindings are final marks the declaration and every later use alike.
 *
 * A token already resolved as a member is skipped: `app.name()` has a variable `app` and a member
 * `name`, and the member is the more specific answer for its own token.
 */
function findVariables(
  tokens: readonly Token[],
  members: ReadonlyMap<number, ResolvedToken>,
  bindings: ReadonlyMap<string, string>,
  snapshots: ReadonlyMap<number, string>,
  typeParameters: ReadonlySet<string>,
  index: ResolverIndex,
): Map<number, ResolvedVariable> {
  const variables = new Map<number, ResolvedVariable>();

  if (bindings.size === 0) {
    return variables;
  }

  for (const [at, token] of tokens.entries()) {
    // The walk's answer for this occurrence wins; the final table is the fallback for a declaration
    // site, whose type was not known until its initialiser had been read.
    const canonical =
      token.isIdentifier && !typeParameters.has(token.text)
        ? (snapshots.get(token.offset) ?? bindings.get(token.text))
        : undefined;

    if (!canonical || members.has(token.offset)) {
      continue;
    }

    // After a `.` or `::` the identifier names a member, not the local that happens to share its
    // name — and a member this pass could not resolve is not a variable either.
    const previous = tokens[at - 1]?.text;

    if (previous === "." || previous === "::") {
      continue;
    }

    const symbol = index.symbols.get(canonical);

    if (symbol) {
      variables.set(token.offset, {
        name: token.text,
        symbol,
        path: canonical,
        kind: symbol.kind,
        doc: symbol.doc,
      });

      continue;
    }

    // A type from another crate is worth naming too. The framework tier answered first, so this is
    // reached only for a local whose type the framework does not define.
    const external = index.externals?.byPath.get(canonical);

    if (external) {
      variables.set(token.offset, {
        name: token.text,
        external,
        path: canonical,
        kind: external.kind,
      });
    }
  }

  return variables;
}

/**
 * Binds each generic parameter to the framework trait that bounds it.
 *
 * `fn register<C: Component>(component: C)` says everything needed: within that function `C` is a
 * `Component`, so `component.configure()` is `Component::configure`. This is the same lexical
 * reading the rest of the file does — the bound is written in the snippet — and it covers a shape
 * documentation uses constantly, since a framework's public API is mostly generic over its traits.
 *
 * Bounds are collected for the whole snippet rather than per scope. A snippet short enough to put in
 * a page does not reuse one parameter letter for two different traits, and tracking scopes properly
 * would mean parsing item boundaries for a case that does not arise.
 */
function readGenericBounds(
  code: string,
  scope: SnippetScope,
  index: ResolverIndex,
  conversions: Map<string, Conversion>,
): Map<string, string> {
  const bounds = new Map<string, string>();

  // `<C: Component>` and `where C: Component`, which are the two places a bound can be written.
  for (const match of code.matchAll(
    /\b([A-Z][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_:]*)\s*(<[^<>]*>)?/g,
  )) {
    const [, parameter, bound, argument] = match;
    const conversion = conversionFor(bound, argument);

    if (conversion && !conversions.has(parameter)) {
      conversions.set(parameter, conversion);
    }

    const resolved =
      index.paths[bound] ??
      resolveToken(bound.split("::").pop() ?? bound, scope, index)?.symbol.path;
    const symbol = resolved ? index.symbols.get(resolved) : undefined;

    // Only a trait bounds a parameter. Matching a struct here would mean the pattern caught
    // something else that looks like `Name: Type` — a struct literal field, most likely.
    if (symbol?.kind === "trait" && !bounds.has(parameter)) {
      bounds.set(parameter, symbol.path);
    }
  }

  return bounds;
}

/**
 * Skips a balanced `<…>` group, returning the index just past it.
 *
 * Nesting is counted rather than matched to the first `>`, so `::<HashMap<String, Greeter>>` is
 * stepped over whole. An unbalanced group — which means the `<` was a comparison after all — runs to
 * the end and is left alone.
 */
function skipAngles(tokens: readonly Token[], at: number): number {
  let depth = 0;

  for (let cursor = at; cursor < tokens.length; cursor += 1) {
    const text = tokens[cursor].text;

    if (text === "<") {
      depth += 1;

      continue;
    }

    if (text === ">") {
      depth -= 1;

      if (depth === 0) {
        return cursor + 1;
      }
    }
  }

  return at + 1;
}

function previousText(
  tokens: readonly Token[],
  at: number,
): string | undefined {
  return tokens[at - 1]?.text;
}

function nextText(tokens: readonly Token[], at: number): string | undefined {
  return tokens[at + 1]?.text;
}

/**
 * Whether a parameter position begins a destructuring pattern rather than a plain name.
 *
 * Two conditions, and the second is what makes this safe. The head must be a single uppercase
 * identifier followed by `{` or `(` — the forms that name their own type — **and** the whole thing
 * must be followed by `:`, because a destructuring parameter is always annotated.
 *
 * Without the annotation check, `log(App::builder())` reads as a pattern: an argument beginning with
 * a capitalised path and an open bracket is exactly the shape of `Json(payload)`. The `:` is the one
 * thing a call can never have there, so it is what separates them.
 */
function isPatternHead(tokens: readonly Token[], at: number): boolean {
  const token = tokens[at];
  const opener = tokens[at + 1]?.text;

  if (
    !token?.isIdentifier ||
    !/^[A-Z]/.test(token.text) ||
    (opener !== "{" && opener !== "(")
  ) {
    return false;
  }

  const closer = opener === "{" ? "}" : ")";
  let depth = 0;

  for (let cursor = at + 1; cursor < tokens.length; cursor += 1) {
    const text = tokens[cursor].text;

    if (text === opener) {
      depth += 1;

      continue;
    }

    if (text === closer) {
      depth -= 1;

      if (depth === 0) {
        return tokens[cursor + 1]?.text === ":";
      }
    }
  }

  return false;
}

/** Positions where `name:` introduces a binding rather than naming a field in a literal. */
function startsBinding(previous: string | undefined): boolean {
  return (
    previous === "(" ||
    previous === "," ||
    previous === "|" ||
    previous === "let" ||
    previous === "mut"
  );
}

/**
 * Reads an `impl` header and binds `self` to the type it is for.
 *
 * `impl Greeter` and `impl Component for Greeter` both name the type last, so the final path in the
 * header is the subject either way. `Self` is bound alongside `self`, since a snippet uses both and
 * they mean the same type here.
 *
 * The binding is not unbound at the end of the block. A snippet with two impl blocks for different
 * types would get the first one's `self` in the second, which is the same snippet-global
 * approximation the rest of this file makes — and a page showing two impls of different types in one
 * fence is not a shape documentation uses.
 */
function readImpl(
  tokens: readonly Token[],
  at: number,
  scope: SnippetScope,
  index: ResolverIndex,
  bindings: Map<string, string>,
): number {
  let cursor = at;

  while (cursor < tokens.length && tokens[cursor].text !== "{") {
    // Generic parameters and the trait half of `impl Trait for Type` are both skipped past: only
    // the last path before the body names the type the block is for.
    if (tokens[cursor].text === "<") {
      cursor = skipAngles(tokens, cursor);

      continue;
    }

    if (!tokens[cursor].isIdentifier) {
      cursor += 1;

      continue;
    }

    const path = readPathSegments(tokens, cursor);
    const canonical = canonicalPath(path.segments, scope, index);

    if (canonical) {
      bindings.set("self", canonical);
      bindings.set("Self", canonical);
    }

    cursor = path.next;
  }

  return cursor;
}

/** Skips a `{ … }` body, including the item's name and generics before it. */
function skipBody(tokens: readonly Token[], at: number): number {
  let cursor = at;

  while (cursor < tokens.length && tokens[cursor].text !== "{") {
    cursor += 1;
  }

  let depth = 0;

  for (; cursor < tokens.length; cursor += 1) {
    if (tokens[cursor].text === "{") {
      depth += 1;

      continue;
    }

    if (tokens[cursor].text === "}") {
      depth -= 1;

      if (depth === 0) {
        return cursor + 1;
      }
    }
  }

  return cursor;
}

/** Reads the name a `let` binds, so the type can be attached once it is known. */
function readBinding(
  tokens: readonly Token[],
  at: number,
  scope: SnippetScope,
  index: ResolverIndex,
  resolved: Map<number, ResolvedToken>,
  bindings: Map<string, string>,
  snapshots: Map<number, string>,
  externalMembers: Map<number, ResolvedExternalMember>,
  written: Map<string, string>,
  conversions: Map<string, Conversion>,
  remember: (pattern: Pattern | undefined) => void,
): number {
  let cursor = at;

  while (tokens[cursor]?.text === "mut" || tokens[cursor]?.text === "ref") {
    cursor += 1;
  }

  // An annotated binding states its type outright, so it needs none of the pattern machinery.
  if (tokens[cursor]?.isIdentifier && tokens[cursor + 1]?.text === ":") {
    return readAnnotation(
      tokens,
      cursor,
      scope,
      index,
      resolved,
      bindings,
      snapshots,
      externalMembers,
      written,
      conversions,
    );
  }

  const pattern = readPattern(tokens, at);

  if (!pattern.pattern) {
    return Math.max(pattern.next, cursor + 1);
  }

  remember(pattern.pattern);

  return pattern.next;
}

/**
 * Binds the names a pattern introduces, once the initialiser's type is known.
 *
 * A struct pattern needs nothing from the initialiser — it names its own type — but it is resolved
 * here with the rest so there is one place that turns a pattern into bindings.
 */
function bindPattern(
  pattern: Pattern | undefined,
  canonical: string | undefined,
  rendered: string | undefined,
  index: ResolverIndex,
  bindings: Map<string, string>,
  resolved: Map<number, ResolvedToken>,
): void {
  if (!pattern) {
    return;
  }

  if (pattern.kind === "name") {
    if (canonical) {
      bindings.set(pattern.name, canonical);
    }

    return;
  }

  if (pattern.kind === "tuple") {
    bindTuple(pattern.names, rendered, canonical, index, bindings);

    return;
  }

  // A newtype pattern with a generic annotation says what it contains outright: `Path(who):
  // Path<String>` hands over a `String`, and the wrapper's own field — which for an extractor from
  // another crate is not indexed at all — never has to be consulted.
  if (pattern.kind === "tupleStruct") {
    const argument = rendered ? firstArgumentOf(rendered) : undefined;
    const type = argument ? typePath(argument, "", "", index) : undefined;

    if (type) {
      bindings.set(pattern.name, type);

      return;
    }
  }

  // Both remaining forms name the type they take apart, so the initialiser is not consulted at all.
  const owner = index.paths[pattern.type] ?? index.names[pattern.type]?.[0];

  if (!owner) {
    return;
  }

  if (pattern.kind === "tupleStruct") {
    bindField(owner, "0", pattern.name, index, bindings);

    return;
  }

  for (const field of pattern.fields) {
    bindField(owner, field.field, field.binds, index, bindings);

    // The field named in the pattern is a reference to that field, exactly as `config.bind` would
    // be. Destructuring is how a reader most often meets a config type's fields, so leaving these
    // unannotated loses the documentation precisely where it is most wanted.
    annotateField(owner, field.field, field.offset, index, resolved);
  }
}

/** Marks the field name in a struct pattern as the member it refers to. */
function annotateField(
  owner: string,
  field: string,
  offset: number,
  index: ResolverIndex,
  resolved: Map<number, ResolvedToken>,
): void {
  const path = `${owner}::${field}`;
  const symbol = index.symbols.get(index.paths[path] ?? "");

  if (symbol) {
    resolved.set(offset, { symbol, path, via: "member" });
  }
}

/** Each name in a tuple pattern takes the type at its position. */
function bindTuple(
  names: readonly (string | undefined)[],
  rendered: string | undefined,
  canonical: string | undefined,
  index: ResolverIndex,
  bindings: Map<string, string>,
): void {
  const elements = rendered ? tupleElements(rendered) : undefined;

  if (!elements) {
    return;
  }

  for (const [position, name] of names.entries()) {
    const element = elements[position];
    const type =
      name && element
        ? typePath(element, canonical ?? "", LOCAL_CRATE, index)
        : undefined;

    if (name && type) {
      bindings.set(name, type);
    }
  }
}

/** Binds one name to the type of the field it destructures. */
function bindField(
  owner: string,
  field: string,
  binds: string,
  index: ResolverIndex,
  bindings: Map<string, string>,
): void {
  const symbol = index.symbols.get(index.paths[`${owner}::${field}`] ?? "");
  const type = symbol ? returnedType(symbol, owner, index) : undefined;

  if (type) {
    bindings.set(binds, type);
  }
}

/**
 * Reads `name: Type`, binding the name to the type when the type is one the framework has.
 *
 * The type is read by the same path reader an expression uses, so an associated item named in an
 * annotation — `value: Component::Output` — is linked exactly as it would be in an expression. A
 * single-segment annotation is checked against the generic parameters first, so `component: C` binds
 * through `C`'s trait bound rather than failing to find a type called `C`.
 */
function readAnnotation(
  tokens: readonly Token[],
  at: number,
  scope: SnippetScope,
  index: ResolverIndex,
  resolved: Map<number, ResolvedToken>,
  bindings: Map<string, string>,
  snapshots: Map<number, string>,
  externalMembers: Map<number, ResolvedExternalMember>,
  written: Map<string, string>,
  conversions: Map<string, Conversion>,
): number {
  const name = tokens[at];

  if (!tokens[at + 2]?.isIdentifier) {
    return at + 2;
  }

  const bound = bindings.get(tokens[at + 2].text);
  let annotated: string | undefined;

  const next = readPath(
    tokens,
    at + 2,
    scope,
    index,
    resolved,
    bindings,
    snapshots,
    externalMembers,
    (type) => (annotated = type),
  );
  const canonical = bound ?? annotated;

  const annotation = writtenType(tokens, at + 2);

  if (canonical) {
    bindings.set(name.text, canonical);
    // The annotation as written, so a `Deref` step on this binding knows what its `T` was.
    written.set(name.text, annotation);
  }

  // A conversion belongs to the value, not to the parameter it was declared on. `fn f<P: AsRef<Path>>(p: P)`
  // records it against `P`; what a snippet then writes is `p.as_ref()`, so it has to reach `p`.
  // `fn f(p: impl AsRef<Path>)` says the same thing inline and is read here directly.
  const inherited = conversions.get(annotation) ?? inlineConversion(annotation);

  if (inherited && !conversions.has(name.text)) {
    conversions.set(name.text, inherited);
  }

  return next;
}

/** The conversion an `impl Trait<Target>` annotation describes, written inline rather than as a bound. */
function inlineConversion(annotation: string): Conversion | undefined {
  const match = /^impl([A-Za-z_][A-Za-z0-9_:]*)(<.+>)$/.exec(annotation);

  return match ? conversionFor(match[1], match[2]) : undefined;
}

/**
 * The type in an annotation, as the author wrote it, generics included.
 *
 * Rebuilt from tokens rather than sliced out of the source, because the walk works in tokens and the
 * source is not threaded through it. Whitespace is lost, which does not matter: the only consumer is
 * generic-argument substitution, which reads the bracket structure.
 */
function writtenType(tokens: readonly Token[], at: number): string {
  // `impl Trait` and `dyn Trait` in argument position: the keyword is kept so the annotation reads
  // as what it is, and the type after it is read exactly as a bare one would be.
  const prefix =
    tokens[at]?.text === "impl" || tokens[at]?.text === "dyn"
      ? tokens[at].text
      : "";
  const path = readPathSegments(tokens, prefix ? at + 1 : at);
  let text = prefix + path.segments.map((segment) => segment.text).join("::");

  if (tokens[path.next]?.text !== "<") {
    return text;
  }

  for (let cursor = path.next, depth = 0; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor].text;

    text += token;

    if (token === "<") {
      depth += 1;
    }

    if (token === ">" && --depth === 0) {
      break;
    }
  }

  return text;
}

/**
 * Reads `.member`, resolving it against the receiver's type and carrying the result forward.
 *
 * `.await` is transparent: rustdoc records an `async fn`'s output as what a caller receives after
 * awaiting, so the chain's type is already correct and the await changes nothing.
 */
function readMember(
  tokens: readonly Token[],
  at: number,
  chain: string | undefined,
  renderedChain: string | undefined,
  binding: string | undefined,
  conversions: ReadonlyMap<string, Conversion>,
  scope: SnippetScope,
  index: ResolverIndex,
  resolved: Map<number, ResolvedToken>,
  externalMembers: Map<number, ResolvedExternalMember>,
  setChain: (next: string | undefined, rendered?: string) => void,
): number {
  const token = tokens[at];

  if (TRANSPARENT.has(token.text)) {
    return at + 1;
  }

  // A conversion is spent by calling its method: `path.as_ref()` on an `impl AsRef<Path>` yields a
  // `Path`, and everything written after it resolves against that. Checked before the ordinary
  // member lookup, because the trait the parameter is bound to does not have the target's members.
  const conversion = binding ? conversions.get(binding) : undefined;

  if (conversion && conversion.method === token.text) {
    setChain(
      typePath(conversion.target, chain ?? "", "", index, scope),
      conversion.target,
    );

    return at + 1;
  }

  const found = chain
    ? lookUpMember(chain, renderedChain, token.text, scope, index)
    : undefined;

  if (!found) {
    setChain(undefined);

    return at + 1;
  }

  if (found.external) {
    const returns = substitute(found.external.member.returns, found.rendered);

    externalMembers.set(token.offset, found.external);
    setChain(
      returns
        ? typePath(
            returns,
            found.owner,
            found.external.owner.crate,
            index,
            scope,
          )
        : undefined,
      returns,
    );

    return at + 1;
  }

  const owner = found.owner;
  const member = found.member!;

  resolved.set(token.offset, {
    symbol: member.symbol,
    path: member.path,
    via: "member",
  });
  setChain(
    returnedType(member.symbol, owner, index, scope),
    rendered(member.symbol),
  );

  return at + 1;
}

/** What a member lookup found, and on which type — which may be one the receiver dereferences to. */
interface MemberLookup {
  /** Canonical path of the type the member was actually found on. */
  readonly owner: string;
  /**
   * How that type was written, generics included.
   *
   * Carried out of the lookup because the member's return type may name one of them: `Atomic<u64>`
   * has a `fetch_add` returning `T`, and only the receiver says that `T` is `u64`.
   */
  readonly rendered: string | undefined;
  readonly member?: { symbol: Symbol; path: string };
  readonly external?: ResolvedExternalMember;
}

/**
 * How many `Deref` steps to follow before giving up.
 *
 * Real chains are one or two — `Arc<Mutex<T>>` is the deep end of what documentation writes — and a
 * bound stops a cyclic or self-referential impl from spinning.
 */
const MAX_DEREF_STEPS = 4;

/**
 * Finds a member on a type, following `Deref` when the type itself does not have it.
 *
 * This is what Rust's own method lookup does, and not doing it makes every wrapper a dead end: a
 * method called on an `Arc<AtomicU64>` is a method on `AtomicU64`, and a `String` is mostly used
 * through `str`. Both tiers are asked at each step, because a framework newtype can dereference to
 * a standard library type and the other way round.
 */
function lookUpMember(
  start: string,
  rendered: string | undefined,
  name: string,
  scope: SnippetScope,
  index: ResolverIndex,
): MemberLookup | undefined {
  let owner: string | undefined = start;
  let written = rendered;

  for (let step = 0; owner && step < MAX_DEREF_STEPS; step += 1) {
    const member = findMember(`${owner}::${name}`, index);

    if (member) {
      return { owner, rendered: written, member };
    }

    const external = findExternalMember(owner, name, written, index);

    if (external) {
      return { owner, rendered: written, external };
    }

    const next = widen(owner, written, scope, index);

    owner = next?.path;
    written = next?.rendered;
  }

  return undefined;
}

/**
 * One step towards the type that actually has the members: through an alias, or through `Deref`.
 *
 * Both are cases of "this type behaves as that one", and Rust's own lookup follows both. An alias is
 * tried first because it is an identity rather than a coercion: `AtomicU64` *is* `Atomic<u64>`, and
 * has no members of its own to prefer.
 *
 * A target naming a type parameter — `Arc<T>` dereferences to `T` — is substituted from how the
 * receiver was actually written, which is why the rendered type is carried alongside the canonical
 * path. Without the substitution every wrapper in the standard library dereferences to the letter
 * `T`, which resolves to nothing.
 */
function widen(
  owner: string,
  rendered: string | undefined,
  scope: SnippetScope,
  index: ResolverIndex,
): { path: string; rendered: string } | undefined {
  const symbol = index.symbols.get(owner);
  const external = index.externals?.byPath.get(owner);
  const target =
    symbol?.aliasOf ??
    external?.aliasOf ??
    symbol?.derefTarget ??
    external?.derefTarget;

  if (!target) {
    return undefined;
  }

  // `Arc<T>` targets `T`; `String` targets `str`. The first is a type parameter to substitute, the
  // second a type to resolve, and they are told apart by shape rather than by whether the name
  // happens to resolve — in a tree of 554 crates something is called `T`, and asking the index
  // answers yes for exactly the wrong reason.
  const substituted = isTypeParameter(target)
    ? firstArgumentOf(rendered)
    : target;

  if (!substituted) {
    return undefined;
  }

  const path = typePath(substituted, owner, "", index, scope);

  return path ? { path, rendered: substituted } : undefined;
}

/** The conversion a bound describes, if it is one of the conversion traits. */
function conversionFor(
  bound: string,
  argument: string | undefined,
): Conversion | undefined {
  const method = CONVERSIONS[bound.split("::").pop() ?? bound];
  const target = argument?.slice(1, -1).trim();

  return method && target ? { method, target } : undefined;
}

/**
 * Whether a rendered type is a generic parameter rather than a named type.
 *
 * Rust's convention — a short capitalised name, `T`, `U`, `B`, `K1` — and it is the only signal
 * available: rustdoc renders a parameter and a type identically once the impl's generics are gone.
 * The convention is followed universally in the standard library, which is the only place `Deref`
 * targets are read from.
 */
function isTypeParameter(target: string): boolean {
  return /^[A-Z][A-Za-z]?[0-9]?$/.test(target.trim());
}

/**
 * A member's return type with the owner's type parameter filled in.
 *
 * `Atomic<u64>::fetch_add` returns `T`, and `T` is only meaningful against how the receiver was
 * written. Returning nothing when it cannot be substituted is the point: in a dependency tree of 554
 * crates something is named `T`, so resolving the bare parameter finds a real but entirely unrelated
 * type — which is how `let count = counter.fetch_add(1)` came out as an `i8`.
 */
function substitute(
  returns: string | null,
  rendered: string | undefined,
): string | undefined {
  if (!returns) {
    return undefined;
  }

  if (!isTypeParameter(returns)) {
    return returns;
  }

  return firstArgumentOf(rendered);
}

/** The first generic argument of a written type, which is what a wrapper's `T` stands for. */
function firstArgumentOf(rendered: string | undefined): string | undefined {
  if (!rendered || !rendered.includes("<")) {
    return undefined;
  }

  return firstGenericArgument(rendered).trim() || undefined;
}

/** A member's return type exactly as it was written, which a tuple pattern needs unreduced. */
function rendered(symbol: Symbol): string | undefined {
  if (symbol.kind === "struct_field" || symbol.kind === "assoc_const") {
    return symbol.signature?.split(":").slice(1).join(":").trim();
  }

  return symbol.returns ?? undefined;
}

/**
 * Reads a path expression and whatever chain follows it.
 *
 * The last segment is the only one that can be a member: everything before it is a module or the
 * type that owns it, and those already resolve as bare identifiers.
 */
function readPath(
  tokens: readonly Token[],
  at: number,
  scope: SnippetScope,
  index: ResolverIndex,
  resolved: Map<number, ResolvedToken>,
  bindings: Map<string, string>,
  snapshots: Map<number, string>,
  externalMembers: Map<number, ResolvedExternalMember>,
  setChain: (
    next: string | undefined,
    rendered?: string,
    binding?: string,
  ) => void,
  written: Map<string, string> = new Map(),
): number {
  const path = readPathSegments(tokens, at);

  if (path.segments.length === 1) {
    const name = path.segments[0];
    const bound = bindings.get(name.text);

    // What this name means *here*. `self` means a different type in each impl block, so the answer
    // has to be kept per occurrence rather than looked up again once the walk has finished.
    if (bound) {
      snapshots.set(name.offset, bound);
    }

    setChain(
      bound ?? annotatedType([name], scope, index),
      bound ? written.get(name.text) : undefined,
      name.text,
    );

    return path.next;
  }

  const last = path.segments[path.segments.length - 1];
  const owner = canonicalPath(path.segments.slice(0, -1), scope, index);
  const member = owner
    ? findMember(`${owner}::${last.text}`, index)
    : undefined;

  // `Arc::new`, `Duration::from_secs` — an associated function on a type another crate defines,
  // which is as common in documentation as a method on one.
  if (!member && path.segments.length === 2) {
    const external = externalOwner(path.segments[0].text, scope, index);
    const found = external
      ? external.members?.find((entry) => entry.name === last.text)
      : undefined;

    if (external && found) {
      externalMembers.set(last.offset, { owner: external, member: found });
      // `let shared = Arc::new(…)` has to bind `shared`, so the chain continues into whatever
      // the associated function returns rather than stopping at the call.
      setChain(
        typePath(
          found.returns ?? "",
          external.path,
          external.crate,
          index,
          scope,
        ),
        found.returns ?? undefined,
      );

      return path.next;
    }
  }

  if (member) {
    resolved.set(last.offset, {
      symbol: member.symbol,
      path: member.path,
      via: "member",
    });
    setChain(
      returnedType(member.symbol, owner!, index, scope),
      rendered(member.symbol),
    );

    return path.next;
  }

  // `Type::new()` and `Type::default()` almost always come from a trait impl, whose members the
  // index does not carry. Nothing is linked — there is no symbol to link to — but the convention is
  // reliable enough to keep the chain alive for whatever is called on the result.
  if (owner && SELF_RETURNING.has(last.text)) {
    setChain(owner);

    return path.next;
  }

  setChain(canonicalPath(path.segments, scope, index));

  return path.next;
}

interface PathRun {
  readonly segments: readonly Token[];
  /** Index of the first token after the path. */
  readonly next: number;
}

/** Reads `A`, `A::b`, `a::B::c` — identifiers joined by `::`. */
function readPathSegments(tokens: readonly Token[], at: number): PathRun {
  const segments: Token[] = [];
  let cursor = at;

  while (tokens[cursor]?.isIdentifier) {
    segments.push(tokens[cursor]);

    if (tokens[cursor + 1]?.text !== "::") {
      cursor += 1;

      break;
    }

    cursor += 2;
  }

  return { segments, next: Math.max(cursor, at + 1) };
}

/**
 * The canonical path a written path refers to.
 *
 * Two readings are tried, because both appear in documentation: the path exactly as written, and the
 * path with its first segment resolved through the snippet's imports. `upwell::App::builder` is the
 * first; `App::builder` after `use upwell::App` is the second.
 */
function canonicalPath(
  segments: readonly Token[],
  scope: SnippetScope,
  index: ResolverIndex,
): string | undefined {
  const written = segments.map((segment) => segment.text).join("::");
  const direct = index.paths[written];

  if (direct) {
    return direct;
  }

  const head = resolveToken(segments[0].text, scope, index);

  if (!head) {
    return undefined;
  }

  if (segments.length === 1) {
    return head.symbol.path;
  }

  const rest = segments
    .slice(1)
    .map((segment) => segment.text)
    .join("::");

  return index.paths[`${head.symbol.path}::${rest}`];
}

/**
 * The type a written path names, including one another crate defines.
 *
 * The framework is asked first. `fn run(message: String)` falls through to the external tier, which
 * is the only place `String` exists — and without this the most ordinary annotation in Rust binds
 * nothing, so `message.len()` after it has no receiver.
 */
function annotatedType(
  segments: readonly Token[],
  scope: SnippetScope,
  index: ResolverIndex,
): string | undefined {
  const framework = canonicalPath(segments, scope, index);

  if (framework || segments.length !== 1) {
    return framework;
  }

  return externalOwner(segments[0].text, scope, index)?.path;
}

/** The external type a written name refers to, honouring the snippet's imports first. */
function externalOwner(
  name: string,
  scope: SnippetScope,
  index: ResolverIndex,
): ExternalSymbol | undefined {
  return externalFromScope(name, scope, index) ?? findExternal(name, index);
}

/**
 * Looks up a member on a type another crate defines.
 *
 * Only answers for types the enrichment reached — the standard library, and only when
 * `rust-docs-json` is installed. Everything else has no member list, so nothing is claimed.
 */
function findExternalMember(
  owner: string,
  name: string,
  rendered: string | undefined,
  index: ResolverIndex,
): ResolvedExternalMember | undefined {
  const type = index.externals?.byPath.get(owner);
  const candidates =
    type?.members?.filter((entry) => entry.name === name) ?? [];

  if (!type || candidates.length === 0) {
    return undefined;
  }

  if (candidates.length === 1) {
    return { owner: type, member: candidates[0] };
  }

  // Several impls define this name — `Atomic<T>` has twelve, one per integer width. The receiver
  // says which: `Atomic<u64>` matches the impl written for it, and nothing else is claimed, because
  // picking one arbitrarily is how `fetch_add` on an `AtomicU64` came out returning an `i8`.
  const member = candidates.find((entry) => entry.subject === rendered);

  return member ? { owner: type, member } : undefined;
}

/** Looks up a member by path, refusing anything that is not one. */
function findMember(
  path: string,
  index: ResolverIndex,
): { symbol: Symbol; path: string } | undefined {
  const canonical = index.paths[path];
  const symbol = canonical ? index.symbols.get(canonical) : undefined;

  return symbol && MEMBER_KINDS.has(symbol.kind) ? { symbol, path } : undefined;
}

/**
 * The type a member evaluates to, as a canonical path.
 *
 * `Self` resolves to the owner, and `Result`/`Option` are read straight through — neither is a
 * framework type, and stopping on one would end every chain at the first fallible call.
 */
function returnedType(
  symbol: Symbol,
  owner: string,
  index: ResolverIndex,
  scope?: SnippetScope,
): string | undefined {
  if (symbol.kind === "struct_field" || symbol.kind === "assoc_const") {
    return typePath(
      symbol.signature?.split(":").slice(1).join(":") ?? "",
      owner,
      symbol.crate,
      index,
      scope,
    );
  }

  return symbol.returns
    ? typePath(symbol.returns, owner, symbol.crate, index, scope)
    : undefined;
}

/**
 * Reduces a rendered type to the canonical path of the thing a reader would call methods on.
 *
 * The crate the type was rendered *in* is what disambiguates a bare name. `AppBuilder` is defined by
 * three crates in this framework, so the name alone is not an answer — but a return type written in
 * `upwell-app` means that crate's `AppBuilder`, because that is the one in scope where the signature
 * was written. Without this the most ordinary shape in the framework, a builder, resolves to nothing.
 */
function typePath(
  rendered: string,
  owner: string,
  crate: string,
  index: ResolverIndex,
  scope?: SnippetScope,
): string | undefined {
  const stripped = rendered
    .trim()
    .replace(/^&\s*(mut\s+)?/, "")
    .replace(/^(impl|dyn)\s+/, "");

  for (const wrapper of TRANSPARENT_GENERICS) {
    if (stripped.startsWith(`${wrapper}<`)) {
      return typePath(
        firstGenericArgument(stripped),
        owner,
        crate,
        index,
        scope,
      );
    }
  }

  const head = /^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*/.exec(
    stripped,
  )?.[0];

  if (!head) {
    return undefined;
  }

  if (head === "Self") {
    return owner;
  }

  const direct = index.paths[head];

  if (direct) {
    return direct;
  }

  // What the snippet imported, before any framework-wide guess. `App` is defined by more than one
  // crate here, so the name alone is ambiguous and `use upwell::prelude::*` is what settles it —
  // which is exactly the step a `Deref` through `Arc<App>` depends on to name what it arrived at.
  if (scope) {
    const imported =
      resolveToken(head, scope, index)?.symbol.path ??
      externalFromScope(head, scope, index)?.path;

    if (imported) {
      return imported;
    }
  }

  const candidates = index.names[head] ?? [];
  const sameCrate = candidates.filter(
    (path) => index.symbols.get(path)?.crate === crate,
  );

  if (sameCrate.length === 1) {
    return sameCrate[0];
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  // Nothing in the framework answers, so ask the reduced tier. `let (message, count) = greet()`
  // gives `message` the type `String`, which is worth saying even though this site documents
  // neither `String` nor the crate it comes from — and without this the most ordinary destructuring
  // in any snippet annotates nothing at all.
  // Primitives included: `count: u64` is what a type lens is for, and the primitive records point
  // at the language's own documentation rather than at the module rustdoc files them under.
  return findExternal(head, index)?.path;
}

/** The first type argument of `Wrapper<A, B>`, respecting nesting. */
function firstGenericArgument(rendered: string): string {
  const open = rendered.indexOf("<");
  let depth = 0;

  for (let cursor = open; cursor < rendered.length; cursor += 1) {
    const character = rendered[cursor];

    if (character === "<") {
      depth += 1;
    } else if (character === ">") {
      depth -= 1;

      if (depth === 0) {
        return rendered.slice(open + 1, cursor);
      }
    } else if (character === "," && depth === 1) {
      return rendered.slice(open + 1, cursor);
    }
  }

  return rendered.slice(open + 1);
}
