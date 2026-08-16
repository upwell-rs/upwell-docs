/**
 * Shared local context for the code blocks inside an `<Example>`.
 *
 * A snippet already reads its own declarations, which is enough when an example is one block. It is
 * not enough for the shape documentation actually uses: declare a type in one block, explain it,
 * then use it in the next. The second block has no idea what the first defined, so exactly the names
 * the prose just introduced go unannotated.
 *
 * Sharing that context across a whole page was the obvious fix and the wrong one. It would make
 * every page pay for a feature most pages do not use, and — worse — it would silently link a name in
 * one example to a definition in an unrelated example further up, which is a wrong answer rather
 * than a missing one. So the context is **opt-in and bounded**: an author wraps the blocks that
 * belong together, and nothing outside that wrapper is affected.
 *
 * ```svx
 * <Example>
 *
 * ```rust
 * struct Greeter { prefix: String }
 * ```
 *
 * Then use it:
 *
 * ```rust
 * let message = greeter.greet("world");
 * ```
 *
 * </Example>
 * ```
 *
 * **Keyed by content hash, never by file or order.** The preprocessor runs before mdsvex and cannot
 * hand anything to the highlighter directly — mdsvex calls it with the code alone, no filename and
 * no position. A registry keyed by what the block *contains* needs neither: Vite may compile files
 * in any order or concurrently, and a content-derived key is correct under both. Two identical
 * snippets in different examples would share an entry, which is harmless — they declare the same
 * things.
 */

import type { PreprocessorGroup } from 'svelte/compiler';

import { blockId } from './block-id.ts';
import { type Declaration, readDeclarations } from './declarations.ts';

/** Opening and closing tags of an example region. */
const REGION = /<Example(?:\s[^>]*)?>([\s\S]*?)<\/Example>/g;

/** A fenced Rust block, with its meta string. */
const RUST_FENCE = /^[ \t]*```rust([^\n]*)\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;

/**
 * Declarations contributed by the *other* blocks of an example, by block content.
 *
 * Module-level because the highlighter has no other channel to read it from. Safe to be so because
 * the key is derived from the content it describes — see the note above.
 */
const shared = new Map<string, Map<string, Declaration>>();

/** Everything the other blocks of the same example declared, if this block is in one. */
export function sharedContextFor(code: string): ReadonlyMap<string, Declaration> | undefined {
	return shared.get(key(code));
}

/**
 * Registers the shared context of every `<Example>` in a page.
 *
 * Runs before mdsvex, so the fences are still literal markdown and can be read as text. It changes
 * nothing — the source is returned untouched — because its only job is to make the association
 * available by the time the highlighter asks for it.
 */
export function exampleContextPreprocessor(): PreprocessorGroup {
	return {
		name: 'framework:example-context',
		markup: ({ content }) => {
			if (!content.includes('<Example')) {
				return;
			}

			for (const region of content.matchAll(REGION)) {
				register(region[1]);
			}

			return undefined;
		}
	};
}

/** Reads one example's blocks and gives each the declarations of all the others. */
function register(region: string): void {
	// A `plain` block opts out of annotation entirely, so it contributes nothing and receives
	// nothing. A `context` block is the opposite: it is never rendered, and exists only to contribute.
	const fences = [...region.matchAll(RUST_FENCE)].filter((fence) => !/(?:^|\s)plain(?:\s|$)/.test(fence[1]));
	const blocks = fences.map((fence) => fence[2]);

	// A `context` block is never rendered, so it has no lines to jump to even though it does declare.
	const rendered = fences.map((fence) => !/(?:^|\s)context(?:\s|$)/.test(fence[1]));

	if (blocks.length < 2) {
		return;
	}

	const declared = blocks.map((code) => readDeclarations(code));
	const ids = blocks.map(blockId);

	for (const [at, code] of blocks.entries()) {
		const context = new Map<string, Declaration>();

		for (const [other, declarations] of declared.entries()) {
			// A block's own declarations are read again by the resolver, from the block itself, where
			// their offsets are meaningful. Only the others are contributed here.
			if (other === at) {
				continue;
			}

			for (const [path, declaration] of declarations) {
				// Stamped with the block it came from, so a use of it can be jumped to across blocks. A
				// `context` block has no rendered lines, so a name from one is annotated but not
				// jumpable — there is nowhere on the page to go.
				if (!context.has(path)) {
					context.set(path, { ...declaration, block: rendered[other] ? ids[other] : undefined });
				}
			}
		}

		shared.set(key(code), context);
	}
}

/**
 * Identity of a block: its content, normalised for trailing whitespace.
 *
 * mdsvex hands the highlighter the fence body with its final newline stripped, so the two views of
 * the same block differ by whitespace alone. Trimming the end makes them agree.
 */
function key(code: string): string {
	return code.trimEnd();
}

/** Clears the registry. Used by tests, which register their own examples. */
export function resetExampleContext(): void {
	shared.clear();
}
