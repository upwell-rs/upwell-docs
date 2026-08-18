/**
 * The absolute origin this site is served from, and URLs built against it.
 *
 * Generated files that other machines read — a sitemap, `robots.txt`, an `llms.txt` index — must carry
 * absolute URLs, and they are prerendered, so the origin is a build input:
 * `SITE_ORIGIN=https://docs.example.com bun run build`. See `src/env.ts` for its default.
 */

import { SITE_ORIGIN } from '$app/env/public';

export const siteOrigin = SITE_ORIGIN;

/** An absolute URL for one path on this site. */
export function siteUrl(path: string): string {
	return `${siteOrigin}${path.startsWith('/') ? path : `/${path}`}`;
}
