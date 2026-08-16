import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'bun run build && bun run preview',
		port: 4173,
		// The build prerenders every guide and every symbol's reference page, so it is minutes rather
		// than seconds. The default 60s timeout is for an app that only has to compile.
		timeout: 10 * 60 * 1000,
		reuseExistingServer: !process.env.CI
	},
	testMatch: '**/*.e2e.{ts,js}'
});
