import { frameworkCrateVersion, type DocsVersion, type FrameworkCrateCoordinates } from '@upwell/docs-core/config';

import type { DocsContent } from '../content.ts';

export interface ReleaseNoticeData {
	readonly currentLabel: string;
	readonly latestLabel: string;
	readonly href: string;
}

interface ReleaseNoticeOptions {
	readonly content: DocsContent;
	readonly version: DocsVersion;
	readonly source: FrameworkCrateCoordinates;
	readonly slug: string;
}

/** Resolves the most specific safe destination in the active crate's configured latest release. */
export function resolveReleaseNotice(options: ReleaseNoticeOptions): ReleaseNoticeData | undefined {
	const { content, version, source, slug } = options;
	const latest = frameworkCrateVersion(source, source.latest);

	if (!latest || version.id === latest.id) {
		return undefined;
	}

	let href: string;

	if (slug.startsWith('src/')) {
		// The current route proves this path exists only in the historical snapshot. Without serialized
		// latest-release inventory, the source root is the nearest destination known to exist.
		href = content.sourceHref(source.crate, latest.id, '');
	} else if (slug === 'symbols' || slug.startsWith('symbols/')) {
		const segments = slug.startsWith('symbols/') ? slug.slice('symbols/'.length) : '';
		const hasEquivalent = segments === ''
			|| Boolean(content.findSymbolPage(segments, latest.releaseVersion));

		href = content.symbolHref(source.crate, latest.id, hasEquivalent ? segments : '').replace(/\/$/, '');
	} else {
		const hasEquivalent = Boolean(content.findPage(slug, latest.releaseVersion));

		href = content.pageHref(latest.id, hasEquivalent ? slug : content.config.landingSlug);
	}

	return {
		currentLabel: version.label,
		latestLabel: latest.label,
		href
	};
}
