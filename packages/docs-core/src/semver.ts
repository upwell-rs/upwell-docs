/**
 * Semantic versions and version requirements.
 *
 * Requirement syntax follows Cargo: `^1.2`, `~1.2`, `>=1.2, <2.0`, `=1.2.3`, `*`.
 */

declare const versionIdBrand: unique symbol;

/** A validated documentation release URL segment. */
export type VersionId = string & { readonly [versionIdBrand]: "VersionId" };

/** Treats a configured release string as a documentation URL id. */
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

    this.name = "VersionSyntaxError";
  }
}

const VERSION =
  /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
const EXACT_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
const DIRECTORY_SELECTOR =
  /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?)?)?$/;

/** Parses a version, or returns undefined if it is not one. */
export function tryParseVersion(value: string): SemVer | undefined {
  return parseMatchedVersion(VERSION.exec(value.trim()), value.trim());
}

/** Parses a complete SemVer release, suitable for a version-directory segment. */
export function tryParseExactVersion(value: string): SemVer | undefined {
  return parseMatchedVersion(EXACT_VERSION.exec(value), value);
}

/** Parses a content-directory selector and preserves its authored precision. */
export function tryParseVersionDirectorySelector(
  value: string,
): VersionDirectorySelector | undefined {
  const match = DIRECTORY_SELECTOR.exec(value);

  if (!match) {
    return undefined;
  }

  const [, , minor, patch] = match;
  const precision = patch === undefined ? (minor === undefined ? 1 : 2) : 3;
  const lower = parseMatchedVersion(match, value)!;

  return { lower, precision, raw: value };
}

function parseMatchedVersion(
  match: RegExpExecArray | null,
  raw: string,
): SemVer | undefined {
  if (!match) {
    return undefined;
  }

  const [, major, minor, patch, prerelease, build] = match;

  return {
    major: Number(major),
    minor: minor === undefined ? 0 : Number(minor),
    patch: patch === undefined ? 0 : Number(patch),
    prerelease:
      prerelease === undefined ? [] : prerelease.split(".").map(identifier),
    build: build ?? null,
    raw,
  };
}

function identifier(part: string): string | number {
  return /^\d+$/.test(part) ? Number(part) : part;
}

/** Parses a version, or throws with the context the caller supplies. */
export function parseVersion(value: string, describe: string): SemVer {
  const parsed = tryParseVersion(value);

  if (!parsed) {
    throw new VersionSyntaxError(
      `${describe} is not a version: "${value}".\n\nExpected something like "0.21.0", "0.21", or "1.0.0-rc.1".`,
    );
  }

  return parsed;
}

/** Parses complete SemVer, rejecting abbreviated range-style forms such as `1.0`. */
export function parseExactVersion(value: string, describe: string): SemVer {
  const parsed = tryParseExactVersion(value);

  if (!parsed) {
    throw new VersionSyntaxError(
      `${describe} is not exact SemVer: "${value}". Expected a complete release such as "0.20.0" or "1.0.0-rc.1".`,
    );
  }

  return parsed;
}

/** Orders two versions by semantic-version precedence. */
export function compareVersions(a: SemVer, b: SemVer): number {
  const byRelease = a.major - b.major || a.minor - b.minor || a.patch - b.patch;

  if (byRelease !== 0) {
    return byRelease;
  }

  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return (
      Number(a.prerelease.length === 0) - Number(b.prerelease.length === 0)
    );
  }

  return comparePrerelease(a.prerelease, b.prerelease);
}

function comparePrerelease(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): number {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const left = a[index];
    const right = b[index];

    if (left === right) {
      continue;
    }

    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }

    if (typeof left === "number") {
      return -1;
    }

    if (typeof right === "number") {
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
  readonly op: "=" | ">" | ">=" | "<" | "<=";
  readonly version: SemVer;
}

/** A version requirement: comparators that must all hold. */
export interface VersionReq {
  readonly comparators: readonly Comparator[];
  readonly raw: string;
}

const COMPARATOR = /^(=|>=|<=|>|<|\^|~)?\s*(.+)$/;

/** Parses a Cargo-style requirement. */
export function parseRequirement(value: string, describe: string): VersionReq {
  const raw = value.trim();

  if (raw === "") {
    throw new VersionSyntaxError(
      `${describe} is an empty version requirement.`,
    );
  }

  if (raw === "*") {
    return { comparators: [], raw };
  }

  const comparators = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .flatMap((part) => parseComparator(part, describe, raw));

  if (comparators.length === 0) {
    throw new VersionSyntaxError(
      `${describe} is not a version requirement: "${raw}".`,
    );
  }

  return { comparators, raw };
}

function parseComparator(
  part: string,
  describe: string,
  raw: string,
): Comparator[] {
  const match = COMPARATOR.exec(part);

  if (!match) {
    throw new VersionSyntaxError(
      `${describe} contains an unreadable comparator: "${part}" in "${raw}".`,
    );
  }

  const [, op = "^", rest] = match;
  const version = tryParseVersion(rest);

  if (!version) {
    throw new VersionSyntaxError(
      `${describe} contains an unreadable version: "${rest}" in "${raw}".\n\nExpected a comparator such as ">=0.21", "^1.0", "~1.2.3", "=1.0.0", or "*".`,
    );
  }

  if (op === "^") {
    return caret(rest, version);
  }

  if (op === "~") {
    return tilde(rest, version);
  }

  return [{ op: op as Comparator["op"], version }];
}

function bound(
  op: Comparator["op"],
  major: number,
  minor: number,
  patch: number,
): Comparator {
  const raw = `${major}.${minor}.${patch}`;

  return {
    op,
    version: { major, minor, patch, prerelease: [], build: null, raw },
  };
}

function caret(written: string, version: SemVer): Comparator[] {
  const lower: Comparator = { op: ">=", version };
  const segments = written.split("-")[0].split(".").length;

  if (version.major > 0) {
    return [lower, bound("<", version.major + 1, 0, 0)];
  }

  if (version.minor > 0 || segments >= 2) {
    return [lower, bound("<", 0, version.minor + 1, 0)];
  }

  return [lower, bound("<", 1, 0, 0)];
}

function tilde(written: string, version: SemVer): Comparator[] {
  const lower: Comparator = { op: ">=", version };
  const segments = written.split("-")[0].split(".").length;

  if (segments === 1) {
    return [lower, bound("<", version.major + 1, 0, 0)];
  }

  return [lower, bound("<", version.major, version.minor + 1, 0)];
}

/** Whether a version satisfies every comparator in a requirement. */
export function satisfies(version: SemVer, requirement: VersionReq): boolean {
  return requirement.comparators.every((comparator) =>
    holds(version, comparator),
  );
}

function holds(version: SemVer, comparator: Comparator): boolean {
  const order = compareVersions(version, comparator.version);

  switch (comparator.op) {
    case "=":
      return order === 0;
    case ">":
      return order > 0;
    case ">=":
      return order >= 0;
    case "<":
      return order < 0;
    case "<=":
      return order <= 0;
  }
}

/** Human form of a requirement, as written. */
export function formatRequirement(requirement: VersionReq): string {
  return requirement.raw;
}
