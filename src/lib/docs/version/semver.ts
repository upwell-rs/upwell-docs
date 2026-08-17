/**
 * Semantic versions and version requirements.
 *
 * The site handles two kinds of string that look alike and mean nothing alike: a **URL id**
 * (`latest`, `0.20`) is a label chosen by whoever configures the site, and a **framework version**
 * (`0.20.0`) is a fact taken from Cargo.toml. Passing one where the other belongs type-checked fine
 * while both were `string`, and did in fact happen. Neither is a plain string here any more.
 *
 * Requirement syntax follows Cargo, because the audience already reads it in `Cargo.toml`:
 * `^1.2`, `~1.2`, `>=1.2, <2.0`, `=1.2.3`, `*`.
 */

/** Marks a string as a validated URL segment rather than a version. */
declare const versionIdBrand: unique symbol;

/**
 * A documentation URL segment, such as `latest` or `0.20`.
 *
 * Branded rather than aliased: the whole point is that it cannot be passed where a `SemVer` is
 * expected, which a bare alias would allow.
 */
export type VersionId = string & { readonly [versionIdBrand]: 'VersionId' };

/** Treats a configured string as a URL id. */
export function versionId(value: string): VersionId {
	return value as VersionId;
}

/** A parsed semantic version. */
export interface SemVer {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
	/** Dot-separated identifiers after `-`. Empty for a normal release. */
	readonly prerelease: readonly (string | number)[];
	/** Metadata after `+`. Ignored in comparisons, as the specification requires. */
	readonly build: string | null;
	/** The text this was parsed from, for messages and display. */
	readonly raw: string;
}

/** A version selector authored as a content-directory name. */
export interface VersionDirectorySelector {
	/** The selector's inclusive lower bound. */
	readonly lower: SemVer;
	/** Number of release components supplied by the author. */
	readonly precision: 1 | 2 | 3;
	/** The text this was parsed from, for messages and display. */
	readonly raw: string;
}

/** A version or requirement that could not be parsed. */
export class VersionSyntaxError extends Error {
	constructor(message: string) {
		super(message);

		this.name = 'VersionSyntaxError';
	}
}

/**
 * `1`, `1.2`, `1.2.3`, `1.2.3-alpha.1`, `1.2.3+build`.
 *
 * Missing minor and patch are permitted and mean zero, so a page may say `since: '0.21'`.
 */
const VERSION = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
const EXACT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
const DIRECTORY_SELECTOR = /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?)?)?$/;

/** Parses a version, or returns undefined if it is not one. */
export function tryParseVersion(value: string): SemVer | undefined {
	return parseMatchedVersion(VERSION.exec(value.trim()), value.trim());
}

/** Parses a complete SemVer release, suitable for a version-directory segment. */
export function tryParseExactVersion(value: string): SemVer | undefined {
	return parseMatchedVersion(EXACT_VERSION.exec(value), value);
}

/**
 * Parses a content-directory selector, preserving whether its author wrote a major, minor, or full
 * SemVer selector. Prereleases require all three release components and build metadata is forbidden.
 */
export function tryParseVersionDirectorySelector(value: string): VersionDirectorySelector | undefined {
	const match = DIRECTORY_SELECTOR.exec(value);

	if (!match) {
		return undefined;
	}

	const [, , minor, patch] = match;
	const precision = patch === undefined ? (minor === undefined ? 1 : 2) : 3;
	const lower = parseMatchedVersion(match, value)!;

	return { lower, precision, raw: value };
}

function parseMatchedVersion(match: RegExpExecArray | null, raw: string): SemVer | undefined {

	if (!match) {
		return undefined;
	}

	const [, major, minor, patch, prerelease, build] = match;

	return {
		major: Number(major),
		minor: minor === undefined ? 0 : Number(minor),
		patch: patch === undefined ? 0 : Number(patch),
		prerelease: prerelease === undefined ? [] : prerelease.split('.').map(identifier),
		build: build ?? null,
		raw
	};
}

/** Numeric prerelease identifiers compare as numbers, so `alpha.2` precedes `alpha.10`. */
function identifier(part: string): string | number {
	return /^\d+$/.test(part) ? Number(part) : part;
}

/** Parses a version, or throws with the context the caller supplies. */
export function parseVersion(value: string, describe: string): SemVer {
	const parsed = tryParseVersion(value);

	if (!parsed) {
		throw new VersionSyntaxError(
			`${describe} is not a version: "${value}".\n\nExpected something like "0.21.0", "0.21", or "1.0.0-rc.1".`
		);
	}

	return parsed;
}

/** Parses complete SemVer, rejecting abbreviated range-style forms such as `1.0`. */
export function parseExactVersion(value: string, describe: string): SemVer {
	const parsed = tryParseExactVersion(value);

	if (!parsed) {
		throw new VersionSyntaxError(`${describe} is not exact SemVer: "${value}". Expected a complete release such as "0.20.0" or "1.0.0-rc.1".`);
	}

	return parsed;
}

/**
 * Orders two versions by semantic-version precedence.
 *
 * Build metadata is ignored, and a prerelease sorts *below* the release it precedes — so
 * `1.0.0-rc.1 < 1.0.0`, which is what makes a page gated on `1.0.0` correctly invisible during its
 * own release candidates.
 */
export function compareVersions(a: SemVer, b: SemVer): number {
	const byRelease = a.major - b.major || a.minor - b.minor || a.patch - b.patch;

	if (byRelease !== 0) {
		return byRelease;
	}

	if (a.prerelease.length === 0 || b.prerelease.length === 0) {
		// Neither, both, or exactly one is a prerelease; only the last case orders.
		return Number(a.prerelease.length === 0) - Number(b.prerelease.length === 0);
	}

	return comparePrerelease(a.prerelease, b.prerelease);
}

/** Numeric identifiers rank below alphanumeric ones; a longer run of equals wins. */
function comparePrerelease(a: readonly (string | number)[], b: readonly (string | number)[]): number {
	for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
		const left = a[index];
		const right = b[index];

		if (left === right) {
			continue;
		}

		if (typeof left === 'number' && typeof right === 'number') {
			return left - right;
		}

		if (typeof left === 'number') {
			return -1;
		}

		if (typeof right === 'number') {
			return 1;
		}

		return left < right ? -1 : 1;
	}

	return a.length - b.length;
}

/** Whether two versions are the same release, ignoring build metadata. */
export function versionsEqual(a: SemVer, b: SemVer): boolean {
	return compareVersions(a, b) === 0;
}

/** Human form, as written. */
export function formatVersion(version: SemVer): string {
	return version.raw;
}

/** One bound of a requirement. */
export interface Comparator {
	readonly op: '=' | '>' | '>=' | '<' | '<=';
	readonly version: SemVer;
}

/**
 * A version requirement: comparators that must **all** hold.
 *
 * `^` and `~` are expanded into bounds at parse time rather than kept as operators, so satisfaction
 * is one rule applied uniformly instead of a special case per shorthand.
 */
export interface VersionReq {
	readonly comparators: readonly Comparator[];
	/** The text this was parsed from. */
	readonly raw: string;
}

const COMPARATOR = /^(=|>=|<=|>|<|\^|~)?\s*(.+)$/;

/**
 * Parses a Cargo-style requirement.
 *
 * ```text
 * *              any version
 * 1.2.3          ^1.2.3 — as in Cargo, a bare version is a caret requirement
 * ^1.2           >=1.2.0, <2.0.0
 * ~1.2           >=1.2.0, <1.3.0
 * >=1.2, <2.0    both bounds
 * =1.2.3         exactly
 * ```
 */
export function parseRequirement(value: string, describe: string): VersionReq {
	const raw = value.trim();

	if (raw === '' ) {
		throw new VersionSyntaxError(`${describe} is an empty version requirement.`);
	}

	if (raw === '*') {
		return { comparators: [], raw };
	}

	const comparators = raw
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part !== '')
		.flatMap((part) => parseComparator(part, describe, raw));

	if (comparators.length === 0) {
		throw new VersionSyntaxError(`${describe} is not a version requirement: "${raw}".`);
	}

	return { comparators, raw };
}

function parseComparator(part: string, describe: string, raw: string): Comparator[] {
	const match = COMPARATOR.exec(part);

	if (!match) {
		throw new VersionSyntaxError(`${describe} contains an unreadable comparator: "${part}" in "${raw}".`);
	}

	const [, op = '^', rest] = match;
	const version = tryParseVersion(rest);

	if (!version) {
		throw new VersionSyntaxError(
			`${describe} contains an unreadable version: "${rest}" in "${raw}".\n\nExpected a comparator such as ">=0.21", "^1.0", "~1.2.3", "=1.0.0", or "*".`
		);
	}

	if (op === '^') {
		return caret(rest, version);
	}

	if (op === '~') {
		return tilde(rest, version);
	}

	return [{ op: op as Comparator['op'], version }];
}

/** Builds a bound from explicit parts, so an expanded shorthand still reads as a version. */
function bound(op: Comparator['op'], major: number, minor: number, patch: number): Comparator {
	const raw = `${major}.${minor}.${patch}`;

	return { op, version: { major, minor, patch, prerelease: [], build: null, raw } };
}

/**
 * `^` — compatible releases, using Cargo's rules for leading zeroes.
 *
 * Below 1.0 the left-most non-zero component is the one held fixed, because a 0.x minor bump is
 * treated as breaking. That matters here: the framework this site documents is pre-1.0.
 */
function caret(written: string, version: SemVer): Comparator[] {
	const lower: Comparator = { op: '>=', version };
	const segments = written.split('-')[0].split('.').length;

	if (version.major > 0) {
		return [lower, bound('<', version.major + 1, 0, 0)];
	}

	if (version.minor > 0 || segments >= 2) {
		return [lower, bound('<', 0, version.minor + 1, 0)];
	}

	return [lower, bound('<', 1, 0, 0)];
}

/** `~` — patch-level changes when a minor is given, minor-level when only a major is. */
function tilde(written: string, version: SemVer): Comparator[] {
	const lower: Comparator = { op: '>=', version };
	const segments = written.split('-')[0].split('.').length;

	if (segments === 1) {
		return [lower, bound('<', version.major + 1, 0, 0)];
	}

	return [lower, bound('<', version.major, version.minor + 1, 0)];
}

/** Whether a version satisfies every comparator in a requirement. */
export function satisfies(version: SemVer, requirement: VersionReq): boolean {
	return requirement.comparators.every((comparator) => holds(version, comparator));
}

function holds(version: SemVer, comparator: Comparator): boolean {
	const order = compareVersions(version, comparator.version);

	switch (comparator.op) {
		case '=':
			return order === 0;
		case '>':
			return order > 0;
		case '>=':
			return order >= 0;
		case '<':
			return order < 0;
		case '<=':
			return order <= 0;
	}
}

/** Human form of a requirement, as written. */
export function formatRequirement(requirement: VersionReq): string {
	return requirement.raw;
}
