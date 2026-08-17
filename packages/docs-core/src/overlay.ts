import { compareVersions, type SemVer, tryParseVersionDirectorySelector, type VersionDirectorySelector } from './semver.ts';

export interface PathCandidate<T> {
	readonly selector: VersionDirectorySelector | null;
	readonly value: T;
}

export interface NormalizedPath {
	readonly path: string;
	readonly selector: VersionDirectorySelector | null;
}

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

export function rejectRedundantSince(selector: VersionDirectorySelector | null, since: unknown, describe: string): void {
	if (selector && since !== undefined) {
		throw new Error(`${describe} is selected by path segment ${selector.raw} and must not also declare frontmatter "since".`);
	}
}

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
