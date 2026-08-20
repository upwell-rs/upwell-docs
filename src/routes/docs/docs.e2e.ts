import { expect, test } from '@playwright/test';

import { docsConfig } from '../../../docs.config.ts';
import { latestVersion } from '@upwell/docs-core/config';

/**
 * The release under test is read from the configuration rather than written into each URL.
 *
 * Version ids change as releases are added, and a suite that hardcodes one throughout fails for a
 * configuration update rather than for a regression.
 */
const RELEASE = latestVersion(docsConfig);
const VERSION = RELEASE.id;

/**
 * End-to-end coverage of the things that only exist once a page is built and served: the version
 * redirect, the symbol annotations the build bakes into code blocks, and the 404. Each is a property
 * of the built output rather than of any one unit, so nothing smaller can check them.
 */

test('/docs resolves to an explicit release', async ({ page }) => {
	await page.goto('/docs');

	await expect(page).toHaveURL(`/docs/${VERSION}/${docsConfig.landingSlug}`);
});

test('/docs/latest redirects to the explicit release', async ({ page }) => {
	await page.goto('/docs/latest');

	await expect(page).toHaveURL(`/docs/${VERSION}/${docsConfig.landingSlug}`);
});

test('client-side release redirects preserve query and fragment state', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/getting-started`);
	await expect(page.locator('.header[data-hydrated]')).toBeVisible();

	await page.locator('body').evaluate((body) => {
		const link = document.createElement('a');
		link.href = '/docs/latest/framework?view=compact#contents';
		body.append(link);
		link.click();
	});

	await expect(page).toHaveURL(`/docs/${VERSION}/framework?view=compact#contents`);
});

test('the release picker falls back to the target landing page when a normalized page is unavailable', async ({ page }) => {
	await page.goto('/docs/1.0.0/framework/new-runtime');
	await expect(page.locator('.header[data-hydrated]')).toBeVisible();

	await page.getByRole('navigation', { name: 'Release' }).getByRole('combobox').selectOption('0.20.0');
	await expect(page).toHaveURL('/docs/0.20.0/getting-started');
});

test('historical guides link to the matching latest guide or its landing page', async ({ page }) => {
	await page.goto('/docs/0.20.0/release-compatibility');

	let notice = page.getByRole('complementary', { name: 'Release notice' });

	await expect(notice).toContainText('You are viewing 0.20.0');
	await expect(notice.getByRole('link', { name: `View the latest release (${RELEASE.label})` })).toHaveAttribute(
		'href',
		`/docs/${VERSION}/release-compatibility`
	);

	await page.goto('/docs/0.20.0/native-daemon-rpc');

	notice = page.getByRole('complementary', { name: 'Release notice' });

	await expect(notice.getByRole('link', { name: `View the latest release (${RELEASE.label})` })).toHaveAttribute(
		'href',
		`/docs/${VERSION}/${docsConfig.landingSlug}`
	);
});

test('a historical source notice links to the verified latest source root', async ({ page }) => {
	await page.goto('/docs/upwell/0.20.0/src/crates/app/src/lib.rs');

	const notice = page.getByRole('complementary', { name: 'Release notice' });

	await expect(notice).toContainText('You are viewing 0.20.0');
	await expect(notice.getByRole('link', { name: `View the latest release (${RELEASE.label})` })).toHaveAttribute(
		'href',
		`/docs/upwell/${VERSION}/src/`
	);
});

test('versioned guide visibility uses normalized routes without a root Guides group', async ({ page }) => {
	await page.goto('/docs/0.20.0/release-compatibility');
	await expect(page.getByRole('heading', { level: 1, name: 'Release compatibility' })).toBeVisible();
	await page.goto('/docs/1.0.0/release-compatibility');
	await expect(page.getByRole('heading', { level: 1, name: 'Release compatibility' })).toBeVisible();

	await page.goto('/docs/0.20.0/components');
	await expect(page.getByRole('heading', { level: 1, name: 'Components and dependency injection' })).toBeVisible();
	await page.goto('/docs/1.0.0/framework/dependency-injection/components');
	await expect(page.getByRole('heading', { level: 1, name: 'Components and injection' })).toBeVisible();

	const legacyOnly = await page.goto('/docs/1.0.0/migration-to-1-0');
	expect(legacyOnly?.status()).toBe(404);

	const introduced = await page.goto('/docs/0.20.0/introduction/new-runtime');
	expect(introduced?.status()).toBe(404);

	await page.goto('/docs/1.0.0/framework/new-runtime');
	await expect(page.getByRole('heading', { level: 1, name: 'New runtime' })).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Documentation' }).locator('details[data-group-id="guides"]')).toHaveCount(0);
});

test('historical releases expose generated symbols by default', async ({ page }) => {
	const symbol = await page.goto('/docs/upwell/0.20.0/symbols/upwell_macros/component');
	expect(symbol?.status()).toBe(200);
	await expect(page.getByRole('heading', { level: 1, name: 'component' })).toBeVisible();

	await page.goto('/docs/0.20.0/components');
	await expect(page.getByRole('heading', { level: 1, name: 'Components and dependency injection' })).toBeVisible();

	// Search is a dialog the client opens, so the page has to be interactive before the click means
	// anything.
	await expect(page.locator('.header[data-hydrated]')).toBeVisible();
	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('combobox', { name: /^Search .+ documentation$/ }).fill('release compatibility');
	await expect(page.locator('.search__result[href="/docs/0.20.0/release-compatibility"]')).toBeVisible();
});

test('the site root is the documentation', async ({ page }) => {
	await page.goto('/');

	// There is no landing page whose only content is a link to the documentation.
	await expect(page).toHaveURL(`/docs/${VERSION}/${docsConfig.landingSlug}`);
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('a guide renders with navigation', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	const sidebar = page.getByRole('navigation', { name: 'Documentation' });

	await expect(page.getByRole('heading', { level: 1, name: 'Components and injection' })).toBeVisible();
	// Scoped to the sidebar: the previous/next footer links to the same page, and an unscoped match
	// would be ambiguous rather than wrong.
	await expect(sidebar.getByRole('link', { name: 'Advanced dependency injection' })).toBeVisible();
	await expect(sidebar.getByRole('link', { name: 'Components and injection' })).toHaveAttribute('aria-current', 'page');
});

test('moved guide routes redirect permanently to their canonical hierarchy', async ({ request }) => {
	const response = await request.get(`/docs/${VERSION}/di/components?source=bookmark`, { maxRedirects: 0 });

	expect(response.status()).toBe(308);
	expect(response.headers().location).toBe(`/docs/${VERSION}/framework/dependency-injection/components?source=bookmark`);
});

test('moved guides do not bypass missing historical release targets', async ({ request }) => {
	const response = await request.get('/docs/0.20.0/di/components', { maxRedirects: 0 });

	expect(response.status()).toBe(404);
});

test('the skip link is the first keyboard control and focuses the reading pane', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	const skip = page.getByRole('link', { name: 'Skip to documentation' });
	const main = page.locator('#docs-main');

	await page.keyboard.press('Tab');

	await expect(skip).toBeFocused();
	await expect(skip).toBeInViewport();
	await expect(skip).toHaveAttribute('href', '#docs-main');

	await page.keyboard.press('Enter');

	await expect(page).toHaveURL(`/docs/${VERSION}/framework/dependency-injection/components#docs-main`);
	await expect(main).toBeFocused();
});

test('a guide publishes one canonical social metadata set for its explicit URL', async ({ page }, testInfo) => {
	const baseURL = testInfo.project.use.baseURL;

	if (typeof baseURL !== 'string') {
		throw new Error('Playwright baseURL must be configured for metadata coverage.');
	}

	const url = `${new URL(baseURL).origin}/docs/${VERSION}/framework/dependency-injection/components`;

	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);
	await expect(page).toHaveURL(url);

	const title = await page.title();
	const metadata = [
		'link[rel="canonical"]',
		'meta[property="og:type"]',
		'meta[property="og:site_name"]',
		'meta[property="og:title"]',
		'meta[property="og:description"]',
		'meta[property="og:url"]',
		'meta[name="twitter:card"]',
		'meta[name="twitter:title"]',
		'meta[name="twitter:description"]'
	];

	expect(title).toContain(`${docsConfig.framework.name} ${RELEASE.label}`);

	for (const selector of metadata) {
		await expect(page.locator(selector)).toHaveCount(1);
	}

	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url);
	await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', url);
	await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
	await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', title);
});

test('code blocks carry symbol metadata resolved at build time', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	const symbol = page.locator('[data-symbol="upwell::prelude::component"]').first();

	await expect(symbol).toBeVisible();
	// The signature and summary come from the framework's own rustdoc output, not from prose written
	// next to the snippet.
	await expect(symbol).toHaveAttribute('data-symbol-signature', /#\[component\]/);
	await expect(symbol).toHaveAttribute('data-symbol-doc', /.+/);
	await expect(symbol).toHaveAttribute('data-symbol-source', /github\.com\/upwell-rs\/upwell\/blob\//);
});

test('clicking a documented code symbol navigates to its canonical authored reference', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	const linked = page.locator('a[data-symbol="upwell::prelude::component"]').first();

	// The facade path resolves to the macro's canonical authored page. The markup is compiled once and
	// rendered for every release it applies to, so the version remains the one the reader selected.
	await expect(linked).toHaveAttribute('href', `/docs/upwell/${VERSION}/symbols/upwell_macros/component`);
	await linked.click();
	await expect(page).toHaveURL(`/docs/upwell/${VERSION}/symbols/upwell_macros/component`);
});

test('a symbol without an authored reference links to its generated declaration page', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework`);

	const annotated = page.locator('[data-symbol="upwell::axum::App"]').first();

	await expect(annotated).toBeVisible();
	await expect(annotated).toHaveJSProperty('tagName', 'A');
	await expect(annotated).toHaveAttribute('href', `/docs/upwell/${VERSION}/symbols/upwell_axum/App`);
});

test('hovering a symbol shows its card', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);
	await expect(page.locator('.header[data-hydrated]')).toBeVisible();

	const symbol = page.locator('[data-symbol="upwell::prelude::component"]').first();
	const card = page.getByRole('dialog', { name: 'Symbol details' });

	await symbol.hover();

	await expect(card).toBeVisible();
	await expect(card).toContainText('#[component]');
	await expect(symbol).toHaveAttribute('aria-haspopup', 'dialog');
	await expect(symbol).toHaveAttribute('aria-expanded', 'true');

	const cardId = await card.getAttribute('id');

	expect(cardId).toBeTruthy();
	await expect(symbol).toHaveAttribute('aria-controls', cardId!);
});

test('the card survives the pointer moving into it, so its links can be used', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	await page.locator('a[data-symbol="upwell::prelude::component"]').first().hover();

	const card = page.getByRole('dialog', { name: 'Symbol details' });
	const link = card.getByRole('link', { name: 'component' });

	// Closing on `mouseout` made these links unreachable by mouse: the pointer has to leave the token
	// and cross a gap to get to them.
	await link.hover();
	await expect(card).toBeVisible();

	await link.click();
	await expect(page).toHaveURL(`/docs/upwell/${VERSION}/symbols/upwell_macros/component`);
});

test('a symbol referenced in prose gets the same treatment as one in code', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/axum/http/request-context`);

	// Not inside a code block: this one is written in a sentence.
	const inline = page.locator('code.symbol-ref [data-symbol="upwell::axum::RequestMeta"]').first();

	await expect(inline).toBeVisible();
	await expect(inline).toHaveAttribute('data-symbol-signature', /pub struct RequestMeta/);
	await expect(inline).toHaveAttribute('data-symbol-feature', 'axum');

	await inline.hover();
	await expect(page.getByRole('dialog', { name: 'Symbol details' })).toBeVisible();
});

test('clicking a documented inline symbol navigates to its authored reference', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	const linked = page.locator('code.symbol-ref a[data-symbol="upwell::prelude::component"]').first();

	await expect(linked).toHaveAttribute('href', `/docs/upwell/${VERSION}/symbols/upwell_macros/component`);
	await linked.click();
	await expect(page).toHaveURL(`/docs/upwell/${VERSION}/symbols/upwell_macros/component`);
});

test('a documented symbol card keeps View source on GitHub', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);
	await expect(page.locator('.header[data-hydrated]')).toBeVisible();

	await page.locator('a[data-symbol="upwell::prelude::component"]').first().hover();

	const source = page.getByRole('dialog', { name: 'Symbol details' }).getByRole('link', { name: 'View source' });

	await expect(source).toHaveAttribute('href', /github\.com\/upwell-rs\/upwell\/blob\//);
});

test("a directory's index page is the group itself, ordered among the root pages", async ({ page }) => {
	await page.goto(`/docs/${VERSION}/getting-started`);

	const sidebar = page.getByRole('navigation', { name: 'Documentation' });
	const tooling = sidebar.locator('details[data-group-id="guides:cargo-upwell"]');

	// The group's label is its index page's title and links to it, instead of repeating as a child.
	await expect(tooling.locator(':scope > summary').getByRole('link', { name: 'Cargo Upwell' })).toHaveAttribute(
		'href',
		`/docs/${VERSION}/cargo-upwell`
	);
	await expect(tooling.getByRole('link', { name: 'Cargo Upwell' })).toHaveCount(1);

	// Its frontmatter order places the whole group last, below root pages a group used to outrank.
	const entries = sidebar.locator('.tree[data-depth="0"] > li');

	await expect(entries.first()).toContainText('Getting started');
	await expect(entries.last()).toContainText('Cargo Upwell');

	await tooling.locator(':scope > summary').getByRole('link', { name: 'Cargo Upwell' }).click();
	await expect(page).toHaveURL(`/docs/${VERSION}/cargo-upwell`);
	await expect(page.getByRole('heading', { level: 1, name: 'Cargo Upwell' })).toBeVisible();
	await expect(tooling.locator(':scope > summary')).toHaveClass(/tree__summary--current/);
});

test('a group entrypoint navigates in the client rather than reloading', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/getting-started`);
	await expect(page.locator('.header[data-hydrated]')).toBeVisible();

	// A value on `window` only survives a client-side navigation, which is the difference being
	// tested: the group's link sits inside a `<summary>`, and anything that stops that click from
	// reaching the router silently turns it into a full page load.
	await page.evaluate(() => {
		(window as unknown as { marker?: boolean }).marker = true;
	});

	await page
		.getByRole('navigation', { name: 'Documentation' })
		.locator('details[data-group-id="guides:cargo-upwell"] > summary')
		.getByRole('link')
		.click();

	await expect(page).toHaveURL(`/docs/${VERSION}/cargo-upwell`);
	expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker === true)).toBe(true);
});

test('moving between pages keeps the current sidebar entry in view', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/jobs/scheduled`);
	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeVisible();

	const sidebar = page.locator('.layout__sidebar');

	// The tree has to overflow for revealing to mean anything; without this the test would pass on a
	// sidebar that happens to fit.
	expect(await sidebar.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
	await sidebar.evaluate((element) => element.scrollTo({ top: 0 }));

	await page.locator('body').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('n');

	await expect(page).toHaveURL(`/docs/${VERSION}/cargo-upwell`);

	// The narrow-viewport navigation renders the same tree, so the entry is matched inside the pane
	// whose scrolling is under test.
	await expect(sidebar.locator('.tree__summary--current')).toBeInViewport();
});

test('sidebar state survives navigation, because the shell is a layout', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	const group = page
		.getByRole('navigation', { name: 'Documentation' })
		.locator('details[data-group-id="guides:axum"]');

	await expect(group).toHaveAttribute('open', '');
	await group.locator(':scope > summary').click();
	await expect(group).not.toHaveAttribute('open', '');

	// A layout is not remounted between pages that share it, so the collapsed group stays collapsed.
	await page.getByRole('link', { name: 'Advanced dependency injection' }).first().click();
	await expect(page).toHaveURL(`/docs/${VERSION}/framework/dependency-injection/advanced`);
	await expect(group).not.toHaveAttribute('open', '');
});

test('path-derived navigation opens every visible-directory ancestor without a root Guides group', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/axum/http`);

	const sidebar = page.getByRole('navigation', { name: 'Documentation' });
	const ancestors = ['guides:axum', 'guides:axum/http'];

	for (const id of ancestors) {
		await expect(sidebar.locator(`details[data-group-id="${id}"]`)).toHaveAttribute('open', '');
	}

	await expect(sidebar.locator('details[data-group-id="guides"]')).toHaveCount(0);
});

test('visible directory groups persist independently by normalized path id', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/axum/http`);

	const sidebar = page.getByRole('navigation', { name: 'Documentation' });
	const protocols = sidebar.locator('details[data-group-id="guides:axum"]');
	const tooling = sidebar.locator('details[data-group-id="guides:cargo-upwell"]');

	await protocols.locator(':scope > summary').click();
	await expect(protocols).not.toHaveAttribute('open', '');
	await expect(tooling).toHaveAttribute('open', '');
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem('framework-docs:collapsed-groups')))
		.toContain('guides:axum');
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem('framework-docs:collapsed-groups')))
		.not.toContain('guides:cargo-upwell');
});

test('topic filtering retains matching ancestors and the current page branch', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	const sidebar = page.getByRole('navigation', { name: 'Documentation' });

	await sidebar.getByRole('button', { name: 'Web' }).click();

	await expect(sidebar.getByRole('link', { name: 'Components and injection' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(sidebar.locator('details[data-group-id="guides:axum"]')).toHaveCount(1);
});

test('the symbol index renders a window of its thousands of rows', async ({ page }) => {
	await page.goto(`/docs/upwell/${VERSION}/symbols`);
	await expect(page.locator('.header[data-hydrated]')).toBeVisible();

	const rows = page.locator('.symbols li');
	const results = page.locator('.results');

	await expect(rows.first()).toBeVisible();

	// The whole point: a release has thousands of symbols and the document holds a few dozen of them.
	const total = Number((await page.locator('.count').innerText()).split(' ')[0]);

	expect(total).toBeGreaterThan(1000);
	expect(await rows.count()).toBeLessThan(60);

	const firstBefore = await rows.first().innerText();

	await results.evaluate((element) => element.scrollTo({ top: 8000 }));
	await expect.poll(async () => (await rows.first().innerText()) !== firstBefore).toBe(true);
	expect(await rows.count()).toBeLessThan(60);

	// Filtering re-counts the list, and returns the reader to the top of it rather than leaving them
	// scrolled past the end of a shorter one.
	await page.getByPlaceholder('Try component or AxumConfig').fill('AxumConfig');
	await expect.poll(async () => Number((await page.locator('.count').innerText()).split(' ')[0])).toBeLessThan(total);
	expect(await results.evaluate((element) => element.scrollTop)).toBe(0);

	await rows.first().getByRole('link').click();
	await expect(page).toHaveURL(`/docs/upwell/${VERSION}/symbols/upwell_axum/config/AxumConfig`);
});

test('guides and symbols have explicit, independent navigation', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	const guideSidebar = page.getByRole('navigation', { name: 'Documentation' });

	await expect(guideSidebar.getByRole('link', { name: 'API index' })).toHaveCount(0);
	await page.getByRole('navigation', { name: 'Documentation sections' }).getByRole('link', { name: 'Symbols' }).click();
	await expect(page).toHaveURL(`/docs/upwell/${VERSION}/symbols`);

	const sidebar = page.getByRole('navigation', { name: 'Symbols' });

	await expect(sidebar.getByRole('link', { name: 'All symbols' })).toHaveAttribute('aria-current', 'page');
	await expect(sidebar.locator('details[data-group-id="symbols:upwell_axum"]')).toHaveAttribute('open', '');

	// A collapsed group renders nothing, so the entry appears when the module it belongs to is opened.
	// The reference tree is thousands of entries; keeping the closed ones in the document is what that
	// costs the browser.
	const entry = sidebar.locator(`a[href="/docs/upwell/${VERSION}/symbols/upwell_axum/config/AxumConfig"]`);

	await expect(entry).toHaveCount(0);
	await sidebar.locator('details[data-group-id="symbols:upwell_axum/config"] > summary').press('Enter');
	await expect(entry).toHaveCount(1);
	await entry.click();
	await expect(page).toHaveURL(`/docs/upwell/${VERSION}/symbols/upwell_axum/config/AxumConfig`);
	await expect(sidebar.getByRole('link', { name: 'AxumConfig', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('client navigation retains the docs frame while route-group areas exchange', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	const header = page.locator('.header');
	const marker = `docs-frame-${Date.now()}`;

	// Hydration is required before a click can prove that SvelteKit retained the client shell rather
	// than following the link as a document navigation.
	await expect(header).toHaveAttribute('data-hydrated');
	await page.evaluate(({ marker }) => {
		const frame = document.querySelector('.header');

		if (!frame) {
			throw new Error('Documentation header is missing.');
		}

		(window as unknown as { docsFrameMarker?: string; docsFrameHeader?: Element }).docsFrameMarker = marker;
		(window as unknown as { docsFrameMarker?: string; docsFrameHeader?: Element }).docsFrameHeader = frame;
	}, { marker });

	await page.locator('a[data-symbol="upwell::prelude::component"]').first().click();
	await expect(page).toHaveURL(`/docs/upwell/${VERSION}/symbols/upwell_macros/component`);
	await expect(page.getByRole('heading', { level: 1, name: 'component' })).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Symbols' })).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toHaveCount(0);
	expect(await page.evaluate(({ marker }) => {
		const state = window as unknown as { docsFrameMarker?: string; docsFrameHeader?: Element };

		return state.docsFrameMarker === marker && state.docsFrameHeader === document.querySelector('.header');
	}, { marker })).toBe(true);

	await page.getByRole('navigation', { name: 'Documentation sections' }).getByRole('link', { name: 'Source' }).click();
	await expect(page).toHaveURL(`/docs/${docsConfig.framework.root.crate}/${VERSION}/src`);
	await expect(header).toHaveAttribute('data-hydrated');
	await expect(page.locator('.viewer')).toBeVisible();
	await expect(page.getByRole('complementary', { name: 'Repository files' })).toBeVisible();
	await expect(page.locator('.layout__reading')).toHaveCount(0);
	expect(await page.evaluate(({ marker }) => {
		const state = window as unknown as { docsFrameMarker?: string; docsFrameHeader?: Element };

		return state.docsFrameMarker === marker && state.docsFrameHeader === document.querySelector('.header');
	}, { marker })).toBe(true);

	await page.getByRole('navigation', { name: 'Documentation sections' }).getByRole('link', { name: 'Guides' }).click();
	await expect(page).toHaveURL(`/docs/${VERSION}/${docsConfig.landingSlug}`);
	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeVisible();
	await expect(page.locator('.layout__reading')).toBeVisible();
	expect(await page.evaluate(({ marker }) => {
		const state = window as unknown as { docsFrameMarker?: string; docsFrameHeader?: Element };

		return state.docsFrameMarker === marker && state.docsFrameHeader === document.querySelector('.header');
	}, { marker })).toBe(true);
});

test('a symbol page shows hand-written prose alongside generated facts', async ({ page }) => {
	await page.goto(`/docs/upwell/${VERSION}/symbols/upwell_macros/component`);

	// Prose the author wrote.
	await expect(page.getByRole('heading', { level: 2, name: 'Generated Behavior' })).toBeVisible();
	// Facts the build supplied, which no one typed into the page.
	await expect(page.getByRole('article').getByText('upwell-macros', { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: /crates\/macros\/src\/lib\.rs:\d+/ })).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Symbols' }).getByRole('link', { name: 'component', exact: true }).first()).toHaveAttribute('aria-current', 'page');
});

test('a cold canonical symbol detail load renders its current navigation tree entry', async ({ page }) => {
	await page.goto(`/docs/upwell/${VERSION}/symbols/cargo_upwell/build/BuildError`);

	const current = page.getByRole('navigation', { name: 'Symbols' }).getByRole('link', { name: 'BuildError', exact: true });

	await expect(current).toHaveAttribute('aria-current', 'page');
	await expect(current).toHaveAttribute('href', `/docs/upwell/${VERSION}/symbols/cargo_upwell/build/BuildError`);
});

test('generated symbol and member signatures are syntax highlighted', async ({ page }) => {
	await page.goto(`/docs/upwell/${VERSION}/symbols/cargo_upwell/build/BuildError`);

	const signature = page.locator('.signature');
	const memberSignature = page.locator('.member__signature').first();

	await expect(signature.locator('.token--keyword', { hasText: 'pub' })).toHaveCount(1);
	await expect(signature.locator('.token--keyword', { hasText: 'enum' })).toHaveCount(1);
	await expect(signature.locator('.token--type')).toContainText('BuildError');
	await expect(memberSignature.locator('.token--type')).toContainText(/AmbiguousExecutable|Cancelled|Capture|Failed/);
});

test('client navigation replaces every generated symbol fact', async ({ page }) => {
	await page.goto(`/docs/upwell/${VERSION}/symbols/cargo_upwell/build/BuildError`);

	const symbols = page.getByRole('navigation', { name: 'Symbols' });
	const target = symbols.locator('.tree__link:visible:not([aria-current="page"])').first();
	const href = await target.getAttribute('href');
	const title = (await target.textContent())?.trim();

	await target.click();

	expect(href).toBeTruthy();
	expect(title).toBeTruthy();
	await expect(page).toHaveURL(href!);
	await expect(page.getByRole('heading', { level: 1, name: title! })).toBeVisible();
	await expect(page.locator('.meta__path code')).not.toContainText('cargo_upwell::build::BuildError');
	await expect(page.locator('.signature')).not.toContainText('pub enum BuildError');
	await expect(page.locator('.member__name', { hasText: 'AmbiguousExecutable' })).toHaveCount(0);
});

test('an unknown symbol answers with a 404', async ({ page }) => {
	const response = await page.goto(`/docs/upwell/${VERSION}/symbols/upwell/DefinitelyNotASymbol`);

	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1, name: 'Not found' })).toBeVisible();
});

test('letter shortcuts move between adjacent path-derived pages', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/advanced`);

	// Shortcuts are registered on mount, so the page has to be interactive before a key means
	// anything. Waiting on a hydration-dependent element is more honest than a fixed delay.
	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeVisible();
	await page.locator('body').click({ position: { x: 5, y: 5 } });

	// Letters, not brackets: `[` and `]` need AltGr on Nordic layouts, so they cannot be pressed
	// unmodified and the matcher — which compares modifiers exactly — would never fire.
	await page.keyboard.press('p');

	await expect(page).toHaveURL(`/docs/${VERSION}/framework/dependency-injection/components`);
});

test('Alt+arrow moves between pages too', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeVisible();
	await page.locator('body').click({ position: { x: 5, y: 5 } });

	await page.keyboard.press('Alt+ArrowRight');

	await expect(page).toHaveURL(`/docs/${VERSION}/framework/dependency-injection/advanced`);
});

test('page navigation includes directory landing pages in depth-first reading order', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	await expect(page.locator('[data-direction="previous"]')).toHaveAttribute(
		'href',
		`/docs/${VERSION}/framework/dependency-injection`
	);
	await expect(page.locator('[data-direction="next"]')).toHaveAttribute(
		'href',
		`/docs/${VERSION}/framework/dependency-injection/advanced`
	);
});

test('search finds a guide by a word in its body', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('combobox', { name: /^Search .+ documentation$/ }).fill('choose one provider');

	// A heading match points into the section rather than the top of the page.
	const first = page.locator('.search__result').first();

	await expect(first).toBeVisible();
	await expect(first).toContainText('Advanced dependency injection');
	await expect(first).toHaveAttribute('href', /#choose-one-provider-or-use-them-all$/);
});

test('a kind filter narrows search to that kind', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('combobox', { name: /^Search .+ documentation$/ }).fill('trait:Component');

	await expect(page.locator('.search__filter')).toContainText('trait');
	// Every result is a symbol; the guide that shares the word is excluded.
	await expect(page.locator('.search__result').first()).toContainText('Component');
	await expect(page.locator('.search__result', { hasText: 'Getting started' })).toHaveCount(0);
});

test('a documented symbol appears once, under its own kind, linking to its page', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('combobox', { name: /^Search .+ documentation$/ }).fill('macro:component');

	// One record, not two: the symbol is reachable at several paths but is one thing, and the
	// hand-written page is where it should lead — not at a path with no page behind it.
	const result = page.locator(`.search__result[href="/docs/upwell/${VERSION}/symbols/upwell_macros/component"]`);

	await expect(result).toHaveCount(1);
	await expect(result).toContainText('component');
});

test('Escape closes the search dialog', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	await page.getByRole('button', { name: 'Search' }).click();

	const search = page.getByRole('combobox', { name: /^Search .+ documentation$/ });

	await search.fill('component');
	await expect(search).toHaveAttribute('aria-expanded', 'true');

	// Escape must reach the dialog: a `type=search` input would swallow it to clear itself, and a
	// global Escape hotkey would swallow it before that.
	await page.keyboard.press('Escape');

	await expect(search).toBeHidden();
});

test('arrowing through results keeps the highlighted one in view', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('combobox', { name: /^Search .+ documentation$/ }).fill('component');

	const list = page.locator('.search__results');
	await expect(list.getByRole('option').first()).toBeVisible();

	// The list has to overflow for this to mean anything.
	expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);

	for (let index = 0; index < 9; index += 1) {
		await page.keyboard.press('ArrowDown');
	}

	// Focus stays in the text field, so the browser will not scroll for the reader — the component
	// has to. Without that, arrowing moved the highlight out of sight.
	const visible = await list.evaluate((node) => {
		const current = node.querySelector('[role="option"][aria-selected="true"]');

		if (!current) {
			return false;
		}

		const listBox = node.getBoundingClientRect();
		const itemBox = current.getBoundingClientRect();

		return itemBox.top >= listBox.top - 1 && itemBox.bottom <= listBox.bottom + 1;
	});

	expect(visible).toBe(true);
	expect(await list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});

test('search opens with a keyboard shortcut and navigates with Enter', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);
	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeVisible();
	await page.locator('body').click({ position: { x: 5, y: 5 } });

	await page.keyboard.press('/');

	const search = page.getByRole('combobox', { name: /^Search .+ documentation$/ });
	const results = page.getByRole('listbox', { name: 'Search results' });

	await search.fill('advanced dependency injection');

	// The index is fetched when the dialog first opens, so there is nothing to choose until it
	// arrives. Waiting for a result is what a reader does too.
	await expect(results).toBeVisible();
	await expect(results.getByRole('option').first()).toBeVisible();
	await page.keyboard.press('Enter');

	await expect(page).toHaveURL(new RegExp(`/docs/${VERSION}/framework/dependency-injection/advanced`));
});

test('a macro invocation resolves, even though its name is lowercase', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/application/app-macro`);

	// `app!` is reached through a glob import and is lowercase, so the caution that stops a bare
	// lowercase name being linked applies to it — but the `!` means it cannot be a local, which is
	// what lifts that caution. It also has to beat a module of the same name in another crate.
	const macro = page.locator('[data-symbol="upwell_macros::app"]').first();

	await expect(macro).toBeVisible();
	await expect(macro).toHaveAttribute('data-symbol-kind', 'proc_macro');
});

test('a local whose type the build worked out carries it', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	const local = page.locator('[data-variable-type]').first();

	// A variable is annotated but is not a symbol: it must not claim to be part of the framework.
	await expect(local).toBeVisible();
	await expect(local).toHaveJSProperty('tagName', 'SPAN');
	await expect(local).not.toHaveAttribute('data-symbol', /./);

	await local.hover();
	await expect(page.getByRole('dialog', { name: 'Symbol details' })).toContainText('local');
});

test('search matches a camel-case name from separate words', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/axum/http`);

	await page.getByRole('button', { name: 'Search' }).click();
	// Cannot match as one substring: the space is not in the identifier.
	await page.getByRole('combobox', { name: /^Search .+ documentation$/ }).fill('http request');

	await expect(page.locator('.search__result').first()).toContainText('HttpRequest');
});

test('search highlights what matched', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);
	await expect(page.locator('.header[data-hydrated]')).toBeVisible();

	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('combobox', { name: /^Search .+ documentation$/ }).fill('component');

	// The highlight comes from the same pass that scored the result, so it marks the reason the
	// result was found rather than a second search over the text.
	await expect(page.locator('.search__result mark').first()).toBeVisible();
});

test('a phone reaches search and release selection through the menu', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 780 });
	await page.goto(`/docs/${VERSION}/${docsConfig.landingSlug}`);
	await expect(page.locator('.header[data-hydrated]')).toBeVisible();

	// The header has no room for either control at this width, so the menu carries them. Hiding them
	// with nowhere else to go would cost a phone the ability to search or leave this release.
	await expect(page.locator('.header__search')).toBeHidden();

	await page.getByRole('button', { name: 'Menu' }).click();

	const menu = page.getByRole('dialog', { name: 'Documentation navigation' });

	await expect(menu.getByRole('navigation', { name: 'Release' }).getByRole('combobox')).toBeVisible();

	// The controls sit above a body that scrolls, so adding them cannot push the menu past the
	// viewport and clip the navigation underneath.
	expect(await menu.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThan(2);
	await expect(menu.locator('.menu__body')).toBeVisible();

	await menu.getByRole('button', { name: 'Search' }).click();

	const search = page.getByRole('combobox', { name: /^Search .+ documentation$/ });

	await expect(search).toBeVisible();
	await expect(search).toHaveAttribute('aria-autocomplete', 'list');
});

test('narrow viewports get navigation, which the sidebar cannot provide', async ({ page }) => {
	await page.setViewportSize({ width: 420, height: 800 });
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	// Below 60rem the sidebar is not laid out at all, so without this the site is readable but not
	// navigable — there is no way to reach another page.
	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeHidden();

	await page.getByRole('button', { name: 'Menu' }).click();

	const menu = page.getByRole('dialog', { name: 'Documentation navigation' });

	await expect(menu).toBeVisible();
	await menu.getByRole('link', { name: 'Advanced dependency injection' }).click();

	await expect(page).toHaveURL(`/docs/${VERSION}/framework/dependency-injection/advanced`);
	// The layout survives navigation, so nothing else would have dismissed the menu.
	await expect(menu).toBeHidden();
});

test('a phone keeps its header and navigation reachable after a long scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 780 });
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

	const header = page.locator('.header');

	await expect(header).toBeInViewport();
	expect(Math.abs((await header.boundingBox())?.y ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(1);
	await page.getByRole('button', { name: 'Menu' }).click();
	await expect(page.getByRole('dialog', { name: 'Documentation navigation' })).toBeVisible();
});

test.describe('touch navigation', () => {
	test.use({ hasTouch: true, viewport: { width: 390, height: 780 } });

	test('copy controls are discoverable without hover', async ({ page }) => {
		await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

		expect(await page.evaluate(() => matchMedia('(hover: none), (pointer: coarse)').matches)).toBe(true);

		const copy = page.locator('.code-block__copy').first();

		await copy.scrollIntoViewIfNeeded();
		await expect(copy).toBeVisible();
		await expect(copy).toBeInViewport();
		await expect(copy).toHaveCSS('opacity', '1');
	});
});

test('copying a code block confirms it, and the toaster loads only then', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);
	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeVisible();

	// The toast library is a chunk of its own, fetched on the first notification rather than shipped
	// to every reader for a feature only interaction triggers.
	await expect(page.locator('[data-sonner-toaster]')).toHaveCount(0);

	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.locator('.code-block__copy').first().click();

	await expect(page.getByText('Copied', { exact: true }).first()).toBeVisible();
});

test('an unknown page answers with a 404 rather than crashing', async ({ page }) => {
	const response = await page.goto(`/docs/${VERSION}/no-such-page`);

	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1, name: 'Not found' })).toBeVisible();
});

test('an undocumented release answers with a 404', async ({ page }) => {
	const response = await page.goto(`/docs/0.1/${docsConfig.landingSlug}`);

	// Documentation routes are prerendered, so an undocumented release is not a page the server can
	// render on demand — it is simply absent. What matters is that it is a 404 with the error page,
	// not a redirect that would quietly show the current release to someone who asked for another.
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1, name: 'Not found' })).toBeVisible();
});

test('a page placing the same component twice does not collide on anchors', async ({ page }) => {
	const errors: string[] = [];

	page.on('pageerror', (error) => errors.push(error.message));

	await page.goto(`/docs/upwell/${VERSION}/symbols/upwell_axum/config/AxumConfig`);

	// Two `<SymbolMembers>` sections both claimed `id="members"`, which the table of contents keys
	// on — a duplicate key throws during hydration and took the whole page down.
	await expect(page.locator('.members__title#members-server-settings')).toBeVisible();
	await expect(page.locator('.members__title#members-request-limits')).toBeVisible();
	await expect(page.locator('.members__title#members-connection-and-shutdown')).toBeVisible();

	const anchors = await page.locator('h2[id]').evaluateAll((nodes) => nodes.map((node) => node.id));

	expect(new Set(anchors).size).toBe(anchors.length);
	expect(errors).toEqual([]);
});

test('a symbol page lists the members the build knows about', async ({ page }) => {
	await page.goto(`/docs/upwell/${VERSION}/symbols/upwell_axum/config/AxumConfig`);

	// Nobody typed these into the page: the names, signatures and summaries come from the release.
	const port = page.locator('#members-server-settings-bind');

	await expect(port).toContainText('bind');
	await expect(port).toContainText('IpAddr');
});

test('a trait page lists its implementors, which is the useful direction', async ({ page }) => {
	await page.goto(`/docs/upwell/${VERSION}/symbols/upwell_axum/messaging/TopicParam`);

	await expect(page.locator('.impls__title', { hasText: 'Implementors' })).toBeVisible();
});

test('a name declared in one block of an example is jumpable from another', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	// `AuditSink` is declared in the first block of the example and used in the second. The jump
	// target is a line in a different block, which is why the declaration carries its own block id.
	const use = page.locator('.code-block:has-text("FileAuditSink") [data-local="AuditSink"]').first();

	await expect(use).toHaveAttribute('data-local-line', /\d+/);

	const block = await use.getAttribute('data-local-block');
	const line = await use.getAttribute('data-local-line');

	await expect(page.locator(`#L${block}-${line}`)).toHaveCount(1);
});

test('a type from another crate is marked and links to its own documentation', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	const arc = page.locator('[data-external="alloc::sync::Arc"]').first();

	await expect(arc).toBeVisible();
	await expect(arc).toHaveAttribute('data-external-crate', 'alloc');
	// It leads away from this site, which is the whole point: Upwell does not document `Arc`.
	await expect(arc).toHaveAttribute('href', /doc\.rust-lang\.org/);

	await arc.hover();
	await expect(page.getByRole('dialog', { name: 'Symbol details' })).toContainText('alloc');
});

test('an external trait is distinguishable from an external type', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	// The kind is most of what the reduced external tier buys, and it is the part that needs no
	// documentation of the other crate at all.
	await expect(page.locator('[data-external-kind="trait"]').first()).toBeVisible();
	await expect(page.locator('[data-external-kind="struct"]').first()).toBeVisible();
});

test("a snippet's own imports decide which of two same-named types it means", async ({ page }) => {
	await page.goto(`/docs/${VERSION}/axum/http`);

	// `Path` is `std::path::Path` and also axum's extractor. The handler imports the extractor,
	// so its spelling is an answer rather than a hint.
	await expect(page.locator('[data-external="axum::extract::path::Path"]').first()).toBeVisible();
	await expect(page.locator('[data-external="std::path::Path"]')).toHaveCount(0);
});

test('a local produced from a component field carries its type', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	const database = page.locator('[data-variable="database"]').first();

	await expect(database).toHaveAttribute('data-variable-type', 'alloc::sync::Arc');
});

test('the external table never reaches the browser', async ({ page }) => {
	const payloads: string[] = [];

	page.on('response', (response) => {
		if (/\.(js|json)$/.test(new URL(response.url()).pathname)) {
			payloads.push(new URL(response.url()).pathname);
		}
	});

	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);
	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeVisible();

	// Annotation happens at build time, so what a reader downloads is finished markup — never the
	// 1.1 MB table of 5,132 external symbols that produced it.
	expect(payloads.some((path) => path.includes('externals'))).toBe(false);
});

test("another crate's type carries that crate's documentation on its card", async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	// The summary comes from the standard library's own rustdoc output, when the toolchain has the
	// `rust-docs-json` component. Without it the card shows the path and the link and nothing else.
	const arc = page.locator('[data-external="alloc::sync::Arc"]').first();

	await expect(arc).toHaveAttribute('data-external-doc', /reference-counting/);
});

test('a let binding takes the type of the expression that produced it', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/dependency-injection/components`);

	// `Arc<Database>` is the expression's outer type, rather than the handwritten field spelling.
	await expect(page.locator('[data-variable="database"]').first()).toHaveAttribute('data-variable-type', 'alloc::sync::Arc');
});

test('a builder method resolves through the facade App type', async ({ page }) => {
	await page.goto(`/docs/upwell/${VERSION}/symbols/upwell_axum/plugin/AxumAppBuilder`);

	const builder = page.locator('[data-symbol="upwell_app::app::App::builder"]').first();

	await expect(builder).toBeVisible();
	await expect(builder).toHaveAttribute('data-symbol-kind', 'assoc_fn');
});

test('a route marker resolves as a macro rather than an ordinary identifier', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/axum/http`);

	const marker = page.locator('[data-symbol="upwell::axum::prelude::get"]').first();

	await expect(marker).toBeVisible();
	await expect(marker).toHaveAttribute('data-symbol-kind', 'proc_macro');
});

test('an extractor pattern binds what it actually hands over', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/axum/http`);

	// `Path(id): Path<u64>` gives `id` the inner primitive, from the annotation rather than from the
	// wrapper — the extractor's own type cannot answer that.
	await expect(page.locator('[data-variable="id"]').first()).toHaveAttribute(
		'data-variable-type',
		'u64'
	);
});

test('annotated identifiers are coloured by what the build resolved them to', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/extensions/plugins`);

	// Shiki colours a token by what it looks like; these are coloured by what they are, which is
	// knowable only because the build resolved them. The plugin declaration includes a constant, a
	// callable, types, and a macro, so it exercises all four semantic colour groups.
	const block = page.locator('.code-block').filter({ hasText: 'const ID: PluginId' }).first();

	await expect(block.locator('[data-lens="callable"]').first()).toBeVisible();
	await expect(block.locator('[data-lens="value"]').first()).toBeVisible();

	const colours = await block
		.locator('[data-lens="callable"], [data-lens="value"], [data-lens="type"], [data-lens="macro"]')
		.evaluateAll((nodes) => [...new Set(nodes.map((node) => getComputedStyle(node).color))]);

	// Four groups on this block, four distinct colours — a palette that collapses is no palette.
	expect(colours.length).toBeGreaterThanOrEqual(4);

	// Fields and locals are deliberately *not* in the palette: they are the data the code owns, and
	// colouring them tints most of a struct body while telling the reader nothing about the framework.
	// They keep whatever the grammar gave them, which is what "same colour as its surroundings" means
	// here — `self` is blue to Shiki and a field name is plain, and both are left alone.
	const untinted = await block
		.locator('[data-lens="field"], [data-lens="local"]')
		.evaluateAll((nodes) =>
			nodes.every((node) => getComputedStyle(node).color === getComputedStyle(node.parentElement!).color)
		);

	expect(untinted).toBe(true);
});

test('an attribute names a macro, and a field looks the same where it is declared', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/axum/http`);

	// `#[controller(…)]` is a proc macro. The facade re-exports a *module* of the same name, which
	// cannot appear in attribute position — resolving to it described the attribute as something it
	// could not be, and coloured it unlike every other attribute on the page.
	await expect(page.locator('[data-symbol="upwell_axum_macros::controller"]').first()).toHaveAttribute(
		'data-lens',
		'macro'
	);

	// A field is the same thing where it is declared as where it is used, and now reads as one.
	const fields = page.locator('.code-block [data-lens="field"]');

	expect(await fields.count()).toBeGreaterThan(1);
});
