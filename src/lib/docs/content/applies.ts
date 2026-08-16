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

import {
	compareVersions,
	parseRequirement,
	parseVersion,
	satisfies,
	type SemVer,
	type VersionReq,
	VersionSyntaxError
} from '../version/semver.ts';

/** A page's declared applicability, as written in frontmatter. */
export interface VersionRange {
	/** First framework version the page applies to. */
	readonly since?: string;
	/** Last framework version the page applies to. */
	readonly until?: string;
	/** A Cargo-style requirement, as an alternative to `since` / `until`. */
	readonly versions?: string;
}

/** A range compiled once, so every page is parsed at load rather than on every lookup. */
export interface CompiledRange {
	readonly requirement: VersionReq | null;
	readonly since: SemVer | null;
	readonly until: SemVer | null;
}

/** Applies to everything. */
export const ALWAYS: CompiledRange = { requirement: null, since: null, until: null };

/**
 * Compiles a declared range, rejecting anything unusable.
 *
 * Shape only, never existence — see the module comment. A malformed bound would otherwise hide the
 * page from every version without a word, which is the worst outcome for a field whose entire job
 * is deciding where a page appears.
 */
export function compileRange(range: VersionRange, describe: string): CompiledRange {
	const hasBounds = range.since !== undefined || range.until !== undefined;

	if (range.versions !== undefined && hasBounds) {
		throw new VersionSyntaxError(
			`${describe} declares both "versions" and "since"/"until". Use one form: "versions" for a requirement such as ">=0.21, <1.0", or "since"/"until" for plain bounds.`
		);
	}

	if (range.versions !== undefined) {
		return { requirement: parseRequirement(range.versions, `${describe} "versions"`), since: null, until: null };
	}

	return {
		requirement: null,
		since: range.since === undefined ? null : parseVersion(range.since, `${describe} "since"`),
		until: range.until === undefined ? null : parseVersion(range.until, `${describe} "until"`)
	};
}

/** Whether a page applies to a framework version. Both bounds are inclusive. */
export function appliesTo(range: CompiledRange, version: SemVer): boolean {
	if (range.requirement) {
		return satisfies(version, range.requirement);
	}

	if (range.since && compareVersions(version, range.since) < 0) {
		return false;
	}

	if (range.until && compareVersions(version, range.until) > 0) {
		return false;
	}

	return true;
}
