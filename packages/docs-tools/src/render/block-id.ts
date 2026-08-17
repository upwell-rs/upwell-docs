/**
 * Identity of a code block, derived from its content.
 *
 * Every line of a rendered block gets an id built from this, so a use of a name can point at the
 * line that declares it. Content-derived rather than a counter for two reasons: a counter would
 * renumber every anchor on a page when a paragraph above it gained a snippet, and — the reason it
 * matters here — the example preprocessor computes a block's id *before* mdsvex runs, while the
 * highlighter computes it again later, and the two have nothing in common but the code itself.
 *
 * Its own module because both of those callers need it and neither may import the other.
 */

/** A short, stable id for a block of code. FNV-1a, which is enough to tell snippets on a page apart. */
export function blockId(code: string): string {
  let hash = 0x811c9dc5;

  // Trailing whitespace is normalised away: mdsvex hands the highlighter the fence body with its
  // final newline stripped, so the preprocessor's view and the highlighter's differ by that alone.
  const normalised = code.trimEnd();

  for (let at = 0; at < normalised.length; at += 1) {
    hash ^= normalised.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(36);
}
