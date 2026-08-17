/** Server-only application composition for artifact-backed docs services. */

import { building } from '$app/env';
import { error } from '@sveltejs/kit';
import { createArtifactService, createSearchIndexService } from '@upwell/docs-kit/server';
import { createDocsServerRouteHelpers } from '@upwell/docs-kit/sveltekit/server';
import { indexedDocuments } from '@upwell/docs-tools/render/document-index';

import { docsContent } from './runtime.ts';

export const docsArtifacts = createArtifactService({
	config: docsContent.config,
	findSymbolPage: docsContent.findSymbolPage,
	symbolHref: docsContent.symbolHref
});

const search = createSearchIndexService({
	content: docsContent,
	documents: indexedDocuments,
	getArtifact: docsArtifacts.getArtifact
});

export const docsServerRoutes = createDocsServerRouteHelpers({
	content: docsContent,
	artifacts: docsArtifacts,
	error: (status, body) => error(status, body),
	building,
	buildSearchIndex: search.build
});
