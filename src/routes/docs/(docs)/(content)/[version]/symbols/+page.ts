import { dev } from '$app/env';
import { redirect } from '@sveltejs/kit';
import { resolvePrerender } from '@upwell/docs-core/config';
import { docsConfig } from 'virtual:docs-config';
import type { EntryGenerator, PageLoad } from './$types';

export const prerender = resolvePrerender(docsConfig, 'redirects', dev);
export const entries: EntryGenerator = () => docsConfig.framework.root.versions.map((version) => ({ version: version.id }));

export const load: PageLoad = ({ params }) => redirect(308, `/docs/${docsConfig.framework.root.crate}/${params.version}/symbols`);
