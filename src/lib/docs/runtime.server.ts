/** Server-only application composition for artifact-backed docs services. */

import { building } from '$app/env';
import { DOCS_GITHUB_API_ORIGIN, DOCS_GITHUB_RAW_ORIGIN } from '$app/env/private';
import { error } from '@sveltejs/kit';
import { createArtifactService, createSearchIndexService, createSourceService } from '@upwell/docs-kit/server';
import { createDocsServerRouteHelpers } from '@upwell/docs-kit/sveltekit/server';
import { indexedDocuments } from '@upwell/docs-tools/render/document-index';

import { docsContent } from './runtime.ts';

export const docsArtifacts = createArtifactService({
	config: docsContent.config,
	symbolPagesFor: docsContent.symbolPagesFor,
	symbolHref: docsContent.symbolHref,
	sourceHref: (source, version, file, line) => `/docs/${source}/${version}/src/${file}#L${line}`,
	building
});

export const docsSources = createSourceService({
	config: docsContent.config,
	artifacts: docsArtifacts,
	fileHref: (source, version, file) => `/docs/${source}/${version}/src/${file}`,
	/**
	 * Repository contents come from GitHub unless the environment names somewhere else.
	 *
	 * Read at runtime rather than baked in: the only caller that overrides these is a test harness
	 * serving a repository it controls, and a value that only a test sets has no business in a
	 * production bundle.
	 */
	github: { api: DOCS_GITHUB_API_ORIGIN, raw: DOCS_GITHUB_RAW_ORIGIN }
});

const search = createSearchIndexService({
	content: docsContent,
	documents: indexedDocuments,
	getCatalog: (version) => docsArtifacts.getCatalog(docsContent.config.framework.root, version)
});

export const docsServerRoutes = createDocsServerRouteHelpers({
	content: docsContent,
	artifacts: docsArtifacts,
	error: (status, body) => error(status, body.message, { suggestions: body.suggestions }),
	building,
	buildSearchIndex: search.build
});
