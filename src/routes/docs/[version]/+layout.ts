/**
 * Documentation routes are prerendered.
 *
 * The adapter is left alone — `adapter-node` still serves the app — but every documentation page is
 * static output. Symbol detail pages are rendered with bounded concurrency and shared artifact caches,
 * so retaining static pages does not make the route count a serial build bottleneck.
 *
 * An unknown version segment is a 404 rather than a redirect to the latest release: silently showing
 * someone 0.20 documentation when they asked for 0.14 is worse than telling them it is not here.
 */

import { dev } from '$app/env';
import { resolvePrerender } from '@upwell/docs-core/config';
import { docsRoutes } from '#lib/docs/runtime';
import { docsConfig } from 'virtual:docs-config';
import type { LayoutLoad } from './$types';

export const prerender = resolvePrerender(docsConfig, 'docs', dev);

export const load: LayoutLoad = ({ params }) => docsRoutes.layout(params.version);
