/**
 * Which framework versions a page applies to.
 *
 * Guides are a single authored trunk, so by default a page applies to every version. Frontmatter
 * narrows that, in whichever of two forms reads better:
 *
 * ```yaml
 * since: '0.21.0'          # from that version onward
 * until: '0.25.0'          # up to and including
 * versions: '>=0.21, <1.0' # any Cargo-style requirement
 * ```
 *
 * `since` / `until` take a plain version; `versions` takes a requirement, with Cargo's meaning —
 * including that a bare version is a caret requirement. Mixing the two forms is an error, because
 * one would silently win.
 *
 * Bounds are **framework versions**, not URL ids, and are checked for shape rather than existence.
 * The release tool cuts a version at release time, so documenting an unreleased feature means
 * naming a version that does not exist yet: a page gated on `0.21.0` while 0.20.0 is current stays
 * hidden and appears by itself the day 0.21.0 ships. Requiring a known release would make it
 * impossible to write documentation ahead of the release it describes.
 */

export * from '@upwell/docs-core/applicability';
