/**
 * Version overlays.
 *
 * Authored content is one trunk, plus optional overlays for the cases where a framework version
 * genuinely says something different:
 *
 * ```text
 * src/content/docs/
 *   getting-started.svx          trunk — every version
 *   concepts/di.svx              trunk — every version
 *   @0.21.0/
 *     concepts/di.svx            overrides the trunk from 0.21.0 onward
 *     jobs.svx                   exists from 0.21.0 onward
 * ```
 *
 * An overlay applies to its version **and every later one**, until a higher overlay supersedes it.
 * That is what keeps the trunk useful: writing an overlay at 0.21.0 does not oblige anyone to copy
 * it into 0.22.0, and a page nobody has changed stays in exactly one place.
 *
 * Overlay directories name **framework versions**, like `since` / `until`, and for the same reason:
 * an overlay is usually written before the release it describes exists.
 *
 * Overlays answer "this version says something different". `since` / `until` answer "this page
 * exists in these versions". Both are needed and neither subsumes the other — a page can be common
 * to many versions and then suddenly change, which is an overlay, and a page can simply not exist
 * yet, which is `since`.
 */

import { compareVersions, parseVersion, type SemVer, tryParseVersion } from '../version/semver.ts';

/** Directory prefix marking an overlay, e.g. `@0.21.0`. */
const OVERLAY_PREFIX = '@';

/** One candidate file for a slug: the trunk copy, or an overlay's. */
export interface Variant<T> {
	/** Framework version the overlay applies from, or null for the trunk. */
	readonly overlay: SemVer | null;
	readonly value: T;
}

/**
 * Splits a content-relative path into its overlay and the slug it contributes to.
 *
 * `@0.21.0/concepts/di` -> overlay `0.21.0`, slug `concepts/di`
 * `concepts/di`         -> overlay null,     slug `concepts/di`
 */
export function splitOverlay(relativePath: string): { overlay: string | null; slug: string } {
	const [head, ...rest] = relativePath.split('/');

	if (!head.startsWith(OVERLAY_PREFIX) || rest.length === 0) {
		return { overlay: null, slug: relativePath };
	}

	return { overlay: head.slice(OVERLAY_PREFIX.length), slug: rest.join('/') };
}

/**
 * Picks the variant that applies to a version: the highest overlay at or below it, else the trunk.
 *
 * Returns undefined when a slug exists only in overlays above the version, which is how a page
 * introduced at 0.21.0 stays absent from 0.20.0 without declaring anything.
 */
export function resolveVariant<T>(variants: readonly Variant<T>[], frameworkVersion: SemVer): T | undefined {
	let best: Variant<T> | undefined;

	for (const variant of variants) {
		if (variant.overlay === null) {
			best ??= variant;

			continue;
		}

		// An overlay from a later version does not apply to this one.
		if (compareVersions(variant.overlay, frameworkVersion) > 0) {
			continue;
		}

		if (!best?.overlay || compareVersions(variant.overlay, best.overlay) > 0) {
			best = variant;
		}
	}

	return best?.value;
}

/**
 * Groups values by the slug they contribute to, parsing each overlay's version.
 *
 * Parsing here rather than at comparison time means a malformed directory is reported once, when
 * content loads, instead of quietly failing to match on every lookup.
 */
export function groupBySlug<T>(
	entries: readonly { relativePath: string; value: T }[],
	describe: string
): Map<string, Variant<T>[]> {
	const grouped = new Map<string, Variant<T>[]>();

	for (const entry of entries) {
		const { overlay, slug } = splitOverlay(entry.relativePath);
		const variants = grouped.get(slug) ?? grouped.set(slug, []).get(slug)!;

		variants.push({
			overlay: overlay === null ? null : parseVersion(overlay, `${describe} overlay directory "@${overlay}"`),
			value: entry.value
		});
	}

	return grouped;
}

/** Every overlay version named anywhere in a set of paths, oldest first. Malformed ones sort last. */
export function overlaysIn(relativePaths: readonly string[]): string[] {
	const found = new Set<string>();

	for (const relativePath of relativePaths) {
		const { overlay } = splitOverlay(relativePath);

		if (overlay) {
			found.add(overlay);
		}
	}

	return [...found].sort((a, b) => {
		const left = tryParseVersion(a);
		const right = tryParseVersion(b);

		if (!left || !right) {
			return a.localeCompare(b);
		}

		return compareVersions(left, right);
	});
}
