/**
 * Environment variables this site reads, with their defaults and when they are read.
 *
 * Declared in one place because the two kinds behave differently and the difference matters. The
 * origin is `static`, so it is inlined when the site is built: the files that need it — `sitemap.xml`,
 * `robots.txt`, `llms.txt` — are prerendered, and a file written at build time cannot ask a request
 * what host it belongs to. The repository origins are read when the app starts, because the only
 * caller that overrides them is a test harness and a value only tests set has no business being
 * baked into a production bundle.
 */

import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	SITE_ORIGIN: {
		public: true,
		static: true,
		description: 'Absolute origin this site is served from, used by the sitemap, robots.txt and llms.txt. Defaults to the port `bun start` serves, so a local build produces files that work locally rather than files claiming a domain the build knows nothing about.',
		schema: (value) => (value ?? 'http://localhost:3000').replace(/\/+$/, '')
	},
	DOCS_GITHUB_API_ORIGIN: {
		description: 'Where the source viewer reads repository inventories from. Overridden only by tests, which serve a repository they own rather than depending on GitHub.',
		schema: (value) => value ?? 'https://api.github.com'
	},
	DOCS_GITHUB_RAW_ORIGIN: {
		description: 'Where the source viewer reads repository file contents from.',
		schema: (value) => value ?? 'https://raw.githubusercontent.com'
	}
});
