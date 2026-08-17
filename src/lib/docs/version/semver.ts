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

export * from '@upwell/docs-core/semver';
