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

import {
	compareVersions,
	type SemVer,
	tryParseVersionDirectorySelector,
	type VersionDirectorySelector
} from '../version/semver.ts';

export interface PathCandidate<T> {
	readonly selector: VersionDirectorySelector | null;
	readonly value: T;
}

export interface NormalizedPath {
	readonly path: string;
	readonly selector: VersionDirectorySelector | null;
}

/** Removes one version selector path segment and returns it as the candidate's selector. */
export function normalizeVersionPath(relativePath: string, describe: string): NormalizedPath {
	const visible: string[] = [];
	let selector: VersionDirectorySelector | null = null;

	for (const segment of relativePath.split('/')) {
		if (segment.startsWith('@')) {
			throw new Error(`${describe} uses legacy version directory "${segment}". Use a version selector such as "1", "1.4", or "1.4.0" instead.`);
		}

		const parsed = tryParseVersionDirectorySelector(segment);

		if (!parsed) {
			if (/^\d/.test(segment) && (segment.includes('-') || segment.includes('+'))) {
				throw new Error(`${describe} has an invalid version selector "${segment}". Prerelease selectors must be full SemVer and build metadata is not allowed.`);
			}

			visible.push(segment);

			continue;
		}

		if (selector) {
			throw new Error(`${describe} has more than one version selector path segment: "${relativePath}".`);
		}

		selector = parsed;
	}

	if (visible.length === 0) {
		throw new Error(`${describe} has no visible path after its version directories are removed.`);
	}

	return { path: visible.join('/'), selector };
}

/** A path selector provides the candidate's lower bound; declaring `since` would be redundant. */
export function rejectRedundantSince(selector: VersionDirectorySelector | null, since: unknown, describe: string): void {
	if (selector && since !== undefined) {
		throw new Error(`${describe} is selected by path segment ${selector.raw} and must not also declare frontmatter "since".`);
	}
}

/** Groups files that normalize to the same logical URL/symbol path. */
export function groupByPath<T>(entries: readonly { relativePath: string; value: T }[], describe: string): Map<string, PathCandidate<T>[]> {
	const grouped = new Map<string, PathCandidate<T>[]>();

	for (const entry of entries) {
		const normalized = normalizeVersionPath(entry.relativePath, describe);
		const candidates = grouped.get(normalized.path) ?? grouped.set(normalized.path, []).get(normalized.path)!;
		const selector = normalized.selector;

		if (selector && candidates.some((candidate) => candidate.selector?.raw === selector.raw)) {
			throw new Error(`${describe} has multiple candidates for "${normalized.path}" with selector ${selector.raw}.`);
		}

		if (candidates.some((candidate) => candidate.selector === null && normalized.selector === null)) {
			throw new Error(`${describe} has multiple baseline candidates for "${normalized.path}".`);
		}

		candidates.push({ selector: normalized.selector, value: entry.value });
	}

	return grouped;
}

/** Whether a selector applies to a release version. */
function selectorMatches(selector: VersionDirectorySelector, releaseVersion: SemVer): boolean {
	if (compareVersions(releaseVersion, selector.lower) < 0) {
		return false;
	}

	if (selector.precision === 3) {
		return true;
	}

	if (releaseVersion.prerelease.length > 0) {
		return false;
	}

	if (selector.precision === 1) {
		return releaseVersion.major === selector.lower.major;
	}

	return releaseVersion.major === selector.lower.major && releaseVersion.minor === selector.lower.minor;
}

/** Selects the eligible candidate with the highest lower bound, then highest authored precision. */
export function resolveCandidate<T>(candidates: readonly PathCandidate<T>[], releaseVersion: SemVer): T | undefined {
	let best: PathCandidate<T> | undefined;

	for (const candidate of candidates) {
		if (candidate.selector === null) {
			best ??= candidate;

			continue;
		}

		if (!selectorMatches(candidate.selector, releaseVersion)) {
			continue;
		}

		if (
			!best?.selector ||
			compareVersions(candidate.selector.lower, best.selector.lower) > 0 ||
			(compareVersions(candidate.selector.lower, best.selector.lower) === 0 && candidate.selector.precision > best.selector.precision)
		) {
			best = candidate;
		}
	}

	return best?.value;
}
