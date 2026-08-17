import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'bun run build && bun run preview',
		port: 4173,
		timeout: 2 * 60 * 1000,
		reuseExistingServer: !process.env.CI
	},
	testMatch: '**/*.e2e.{ts,js}'
});
