/**
 * Versioned content paths.
 *
 * Version directory selectors are content candidates, not URL or navigation segments:
 *
 * ```text
 * protocols/1.4/http/getting-started.svx -> protocols/http/getting-started, for stable 1.4.x
 * ```
 *
 * A normal file is the baseline candidate. Full SemVer selectors replace it at their lower bound and
 * carry forward. Major and minor selectors apply only to stable releases in their bounded range. A
 * candidate may contain exactly one selector. `@<version>` was the interim syntax and is deliberately
 * rejected rather than silently treated as a visible path.
 */

export * from '@upwell/docs-core/overlay';
