import { defineConfig } from '@playwright/test';

export default defineConfig({
	// Explicit, because a `webServer` array means Playwright no longer infers it from a single server's
	// port, and every suite navigates by path.
	use: { baseURL: 'http://localhost:4173' },
	webServer: [
		/*
		 * A repository, served locally.
		 *
		 * The source viewer reads repository contents from the server, not the browser, so no page-level
		 * interception can reach those requests. Serving a fixture repository and pointing the viewer's
		 * two origins at it is what makes that half of the site testable — against content the suite
		 * owns, with no rate limit and no network.
		 */
		{
			command: 'bun run tests/source-fixture-server.ts',
			port: 5199,
			reuseExistingServer: !process.env.CI
		},
		{
			command: 'bun run build && bun run preview',
			port: 4173,
			timeout: 2 * 60 * 1000,
			reuseExistingServer: !process.env.CI,
			env: {
				// The generated sitemap, robots.txt and llms.txt carry absolute URLs baked in at build time,
				// so the suite builds with the origin it will be served from and can assert on what they say.
				SITE_ORIGIN: 'http://localhost:4173',
				DOCS_GITHUB_API_ORIGIN: 'http://localhost:5199',
				DOCS_GITHUB_RAW_ORIGIN: 'http://localhost:5199'
			}
		}
	],
	testMatch: '**/*.e2e.{ts,js}'
});
