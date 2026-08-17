import { dev } from '$app/env';
import { resolvePrerender } from '@upwell/docs-core/config';
import { docsServerRoutes } from '#lib/docs/runtime.server';
import { docsConfig } from 'virtual:docs-config';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = resolvePrerender(docsConfig, 'symbols', dev);

export const entries: EntryGenerator = () => [...docsServerRoutes.symbolIndexEntries()];

export const load: PageServerLoad = ({ params }) => docsServerRoutes.loadSymbolsIndex(params.version);
