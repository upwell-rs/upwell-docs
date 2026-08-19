import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';

import { parseVersion, versionId } from '@upwell/docs-core/semver';

import AuthoringRefsFixture from './AuthoringRefsFixture.svelte';
import AuthoringRefsTestHarness from './AuthoringRefsTestHarness.svelte';

function version(id: string, release: string) {
	return { id: versionId(id), label: release, releaseVersion: parseVersion(release, 'Test version') };
}

function text(value: string) {
	return createRawSnippet(() => ({ render: () => value }));
}

describe('authoring references', () => {
	it('uses the active version, root crate defaults, normalized paths, and authored children', async () => {
		const screen = render(AuthoringRefsFixture, {
			customGuide: text('Start here'),
			customSymbol: text('Extra client'),
			customSource: text('Implementation')
		}, { wrapper: AuthoringRefsTestHarness, wrapperProps: { version: version('root-v1', '1.0.0') } });

		await expect.element(screen.getByRole('link', { name: 'Start here' })).toHaveAttribute('href', '/docs/root-v1/getting-started');
		await expect.element(screen.getByRole('link', { name: 'Start here' })).toHaveClass('guide-ref');
		await expect.element(screen.getByRole('link', { name: 'configuration' }).nth(0)).toHaveAttribute('href', '/docs/root-v1/configuration');
		await expect.element(screen.getByRole('link', { name: 'configuration' }).nth(1)).toHaveAttribute('href', '/docs/root-v1/configuration#advanced-options');
		await expect.element(screen.getByRole('link', { name: 'framework::App' })).toHaveAttribute('href', '/docs/framework/root-v1/symbols/framework/App');
		await expect.element(screen.getByRole('link', { name: 'Extra client' })).toHaveAttribute('href', '/docs/framework-extra/extra-v1/symbols/extra/Client');
		await expect.element(screen.getByRole('link', { name: 'extra::Pinned' })).toHaveAttribute('href', '/docs/framework-extra/extra-v1/symbols/extra/Pinned');
		await expect.element(screen.getByRole('link', { name: 'crates/app/src/odd#name.rs' })).toHaveAttribute('href', '/docs/framework/root-v1/src/crates/app/src/odd%23name.rs');
		await expect.element(screen.getByRole('link', { name: 'Implementation' })).toHaveAttribute('href', '/docs/framework-extra/extra-v1/src/src/lib.rs');
	});

	it('reacts when client navigation changes the active version', async () => {
		const screen = render(AuthoringRefsFixture, { customSymbol: text('Extra client') }, {
			wrapper: AuthoringRefsTestHarness,
			wrapperProps: { version: version('root-v1', '1.0.0') }
		});

		await expect.element(screen.getByRole('link', { name: 'configuration' }).nth(0)).toHaveAttribute('href', '/docs/root-v1/configuration');
		screen.wrapper.navigate(version('root-v2', '2.0.0'));
		await expect.element(screen.getByRole('link', { name: 'configuration' }).nth(0)).toHaveAttribute('href', '/docs/root-v2/configuration');
		await expect.element(screen.getByRole('link', { name: 'configuration' }).nth(1)).toHaveAttribute('href', '/docs/root-v2/configuration#advanced-options');
		await expect.element(screen.getByRole('link', { name: 'framework::App' })).toHaveAttribute('href', '/docs/framework/root-v2/symbols/framework/App');
		await expect.element(screen.getByRole('link', { name: 'Extra client' })).toHaveAttribute('href', '/docs/framework-extra/extra-latest/symbols/extra/Client');
		await expect.element(screen.getByRole('link', { name: 'crates/app/src/odd#name.rs' })).toHaveAttribute('href', '/docs/framework/root-v2/src/crates/app/src/odd%23name.rs');
	});

	it('uses the active custom-source release while resolving root guides independently', async () => {
		const screen = render(AuthoringRefsFixture, {
			customSymbol: text('Extra client'),
			customSource: text('Implementation')
		}, {
			wrapper: AuthoringRefsTestHarness,
			wrapperProps: { activeSource: 'framework-extra', version: version('extra-latest', '9.0.0') }
		});

		await expect.element(screen.getByRole('link', { name: 'configuration' }).nth(0)).toHaveAttribute('href', '/docs/root-v2/configuration');
		await expect.element(screen.getByRole('link', { name: 'Extra client' })).toHaveAttribute('href', '/docs/framework-extra/extra-latest/symbols/extra/Client');
		await expect.element(screen.getByRole('link', { name: 'Implementation' })).toHaveAttribute('href', '/docs/framework-extra/extra-latest/src/src/lib.rs');
	});
});
