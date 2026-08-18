/** Server-only application composition for artifact-backed docs services. */

import { building } from '$app/env';
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
	artifacts: docsArtifacts
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
