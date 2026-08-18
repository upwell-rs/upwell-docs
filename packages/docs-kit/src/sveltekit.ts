import { docsVersions, resolveVersion as resolveConfiguredVersion, type DocsVersion } from '@upwell/docs-core/config';

import type { DocsContent } from './content.ts';

export interface RouteError {
	readonly message: string;
	readonly suggestions?: string[];
}

export interface DocsRouteHelpersOptions {
	readonly content: DocsContent;
	readonly error: (status: number, body: RouteError) => never;
}

/** Framework-neutral route algorithms for a conventional versioned SvelteKit docs tree. */
export function createDocsRouteHelpers(options: DocsRouteHelpersOptions): {
	resolveVersion(id: string): DocsVersion;
	layout(id: string): { readonly version: DocsVersion };
	guideEntries(): { readonly version: string; readonly slug: string }[];
	loadGuide(params: { readonly slug: string }, version: DocsVersion): Promise<{
		readonly version: DocsVersion;
		readonly page: NonNullable<ReturnType<DocsContent['findPage']>>;
		readonly component: Awaited<ReturnType<DocsContent['loadPage']>>;
		readonly chrome: { readonly slug: string; readonly title: string; readonly section: string; readonly reference: false };
		readonly previous?: ReturnType<DocsContent['siblings']>['previous'];
		readonly next?: ReturnType<DocsContent['siblings']>['next'];
	}>;
	latestEntries(): { readonly slug: string }[];
	latestTarget(slug: string): string;
	searchEntries(): { readonly version: string }[];
} {
	const { content, error } = options;
	const notFound = (body: RouteError): never => error(404, body);

	function resolveVersion(id: string): DocsVersion {
		const version = resolveConfiguredVersion(content.config, id);

		if (!version) {
			return notFound({ message: `There is no documentation for version "${id}". Documented releases: ${docsVersions(content.config).map((entry) => entry.id).join(', ')}.` });
		}

		return version;
	}

	return {
		resolveVersion,
		layout: (id) => ({ version: resolveVersion(id) }),
		guideEntries: () => docsVersions(content.config).flatMap((version) => [
			{ version: version.id, slug: '' },
			...content.pagesFor(version.releaseVersion).map((page) => ({ version: version.id, slug: page.slug }))
		]),
		async loadGuide(params, version) {
			const slug = params.slug === '' ? content.config.landingSlug : params.slug;
			const page = content.findPage(slug, version.releaseVersion);
			const component = page ? await content.loadPage(slug, version.releaseVersion) : undefined;

			if (!page || !component) {
				return notFound({ message: `There is no documentation page at "${slug}" for ${version.label}.` });
			}

			return {
				version,
				page,
				component,
				chrome: {
					slug,
					title: page.title,
					section: page.slug.split('/').slice(0, -1).join(' / ') || 'Documentation',
					reference: false
				},
				...content.siblings(slug, version.releaseVersion)
			};
		},
		latestEntries: () => {
			const version = resolveVersion(content.config.framework.root.latest);

			return [
				{ slug: '' },
				{ slug: 'symbols' },
				...content.pagesFor(version.releaseVersion).map((page) => ({ slug: page.slug })),
				...content.symbolPagesFor(version.releaseVersion).map((page) => ({ slug: `symbols/${page.segments}` }))
			];
		},
		latestTarget(slug) {
			const version = resolveVersion(content.config.framework.root.latest);

			return content.pageHref(version.id, slug || content.config.landingSlug);
		},
		searchEntries: () => docsVersions(content.config).map((version) => ({ version: version.id }))
	};
}
