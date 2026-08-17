/**
 * Resolves one authored page within a documented release.
 *
 * `entries` is what makes prerendering enumerate the site: a catch-all route has no discoverable
 * URLs, so every (version, slug) pair is listed from the content index. The empty slug is included
 * so `/docs/<version>` serves the landing page.
 */

import { docsRoutes } from '#lib/docs/runtime';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => [...docsRoutes.guideEntries()];

export const load: PageLoad = async ({ params, parent }) => docsRoutes.loadGuide(params, (await parent()).version);
