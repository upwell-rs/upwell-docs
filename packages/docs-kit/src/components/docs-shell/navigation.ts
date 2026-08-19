import {
	resolveFrameworkReferenceVersion,
	type DocsConfig,
	type DocsSource,
	type DocsVersion,
	type FrameworkCrateCoordinates
} from '@upwell/docs-core/config';

import type { DocsContent } from '../../content.ts';

interface VersionNavigationOptions {
	readonly content: DocsContent;
	readonly activeSource: DocsSource;
	readonly slug: string;
	readonly versions: readonly DocsVersion[];
	readonly targetVersionId: string;
}

interface AuthoringReferenceOptions {
	readonly config: DocsConfig;
	readonly activeSource: string;
	readonly activeVersion: DocsVersion;
	readonly source?: string;
	readonly version?: string;
}

export interface AuthoringReferenceTarget {
	readonly source: FrameworkCrateCoordinates;
	readonly version: DocsVersion;
}

/** Resolves a version switch to the closest destination known to exist in that release. */
export function resolveVersionNavigationTarget(options: VersionNavigationOptions): string | undefined {
	const { content, activeSource, slug, versions, targetVersionId } = options;
	const target = versions.find((candidate) => candidate.id === targetVersionId);

	if (!target) {
		return undefined;
	}

	if (slug.startsWith('src/')) {
		return content.sourceHref(activeSource.crate, target.id, slug.slice('src/'.length));
	}

	if (slug === 'symbols') {
		return content.symbolHref(activeSource.crate, target.id, '');
	}

	if (slug.startsWith('symbols/')) {
		const path = slug.slice('symbols/'.length);
		const rootSource = activeSource.crate === content.config.framework.root.crate;
		const available = !rootSource || Boolean(content.findSymbolPage(path, target.releaseVersion));

		return content.symbolHref(activeSource.crate, target.id, available ? path : '');
	}

	const available = Boolean(content.findPage(slug, target.releaseVersion));

	return content.pageHref(target.id, available ? slug : content.config.landingSlug);
}

/** Resolves authoring references against an active source without exposing UI state to the policy. */
export function resolveAuthoringReferenceTarget(options: AuthoringReferenceOptions): AuthoringReferenceTarget {
	const resolved = resolveFrameworkReferenceVersion(options.config, {
		source: options.source,
		version: options.version,
		activeSource: options.activeSource,
		activeVersion: options.activeVersion
	});

	if (!resolved) {
		throw new Error(
			`Unknown documentation source or version: ${options.source ?? options.config.framework.root.crate}${options.version ? `@${options.version}` : ''}.`
		);
	}

	return resolved;
}
