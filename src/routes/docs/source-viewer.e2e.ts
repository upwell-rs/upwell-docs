import { expect, test } from '@playwright/test';

import { docsConfig } from '../../../docs.config.ts';
import { latestVersion } from '@upwell/docs-core/config';

/**
 * The repository browser, against the fixture repository the suite serves.
 *
 * This half of the site had no coverage at all, because its content arrives over the network on the
 * server side: unreachable from a page, and dependent on GitHub's availability and rate limits. The
 * fixture server in `playwright.config.ts` removes both problems, so what is exercised here is the
 * real load path — inventory, contents, highlighting, and the tree — with a repository whose files
 * are chosen to reach the parts that have broken before.
 */
const VERSION = latestVersion(docsConfig).id;
const SOURCE = docsConfig.framework.root.crate;
const BASE = `/docs/${SOURCE}/${VERSION}/src`;

test('a directory shows its files and its own README', async ({ page }) => {
	await page.goto(`${BASE}/`);

	const tree = page.getByRole('complementary', { name: 'Repository files' });

	await expect(tree.getByRole('link', { name: 'Cargo.toml' })).toBeVisible();
	await expect(page.getByRole('heading', { level: 1, name: 'Example crate' })).toBeVisible();

	// The README's own links resolve: a viewable file into the viewer, a fragment to the heading id the
	// sanitizer emits, and a binary asset to the repository.
	await expect(page.getByRole('link', { name: 'the guide' })).toHaveAttribute('href', `${BASE}/docs/guide.md`);
	await expect(page.getByRole('link', { name: 'usage', exact: true })).toHaveAttribute('href', '#user-content-usage');
	await expect(page.getByRole('link', { name: 'logo' })).toHaveAttribute('href', /raw|github/);
});

test('a source file renders highlighted with line anchors', async ({ page }) => {
	await page.goto(`${BASE}/crates/app/src/lib.rs#L4`);

	const code = page.locator('.code');

	await expect(code).toContainText('pub struct Greeter');
	await expect(code.locator('.line').first()).toBeVisible();
	// The anchor the URL names is the line the reader is sent to.
	await expect(page.locator('.line:target')).toHaveCount(1);
	await expect(page.getByRole('link', { name: 'View on GitHub' })).toHaveAttribute(
		'href',
		new RegExp(`^${docsConfig.framework.root.repository}/blob/`)
	);
});

test('the file tree renders a window of a large repository', async ({ page }) => {
	await page.goto(`${BASE}/crates/app/src/lib.rs`);

	const tree = page.getByRole('complementary', { name: 'Repository files' });
	const rows = tree.locator('.row');

	await expect(rows.first()).toBeVisible();
	await tree.getByLabel('Filter repository files').fill('module');

	// The fixture has 1,200 matching files and no page two: the list is whole and the document is not.
	await expect.poll(async () => rows.count()).toBeLessThan(80);
	await expect(rows.first()).toBeVisible();

	const nav = tree.locator('nav');

	await nav.evaluate((element) => element.scrollTo({ top: 6000 }));
	await expect.poll(async () => (await rows.first().innerText()).trim()).not.toBe('crates');
});

test('filenames with URL-reserved and literal-percent characters are reachable', async ({ page }) => {
	await page.goto(`${BASE}/crates/app/src/lib.rs`);

	const tree = page.getByRole('complementary', { name: 'Repository files' });

	// `#` is legal in a Git filename and would otherwise be read as the start of a fragment.
	await tree.getByLabel('Filter repository files').fill('odd');
	await tree.getByRole('link', { name: 'odd#name.rs' }).click();

	await expect(page).toHaveURL(`${BASE}/crates/app/src/odd%23name.rs`);
	await expect(page.locator('.code')).toContainText('pub const ODD');

	// `%` is part of the repository filename, not a second URL-encoding layer.
	await page.goto(`${BASE}/crates/app/src/lib.rs`);
	await tree.getByLabel('Filter repository files').fill('malformed');
	await tree.getByRole('link', { name: 'malformed%2 name.rs' }).click();

	await expect(page).toHaveURL(`${BASE}/crates/app/src/malformed%252%20name.rs`);
	await expect(page.locator('.code')).toContainText('pub const PERCENT');
});

test('a malformed percent-encoded source URL is rejected before route parameters are decoded', async ({ page }) => {
	const response = await page.goto(`${BASE}/crates/app/src/malformed%2`);

	expect(response?.status()).toBe(400);
});

test('a Markdown file offers both its preview and its source', async ({ page }) => {
	await page.goto(`${BASE}/docs/guide.md`);

	await expect(page.getByRole('heading', { level: 1, name: 'Guide' })).toBeVisible();
	await page.getByRole('button', { name: 'View source' }).click();

	await expect(page.locator('.code')).toContainText('# Guide');
	await page.getByRole('button', { name: 'Preview' }).click();

	await expect(page.getByRole('heading', { level: 1, name: 'Guide' })).toBeVisible();
});

test('the file drawer reveals the active file when a phone opens it', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 780 });
	await page.goto(`${BASE}/crates/generated/src/module900.rs`);
	await expect(page.locator('.header[data-hydrated]')).toBeVisible();

	// The drawer has no layout until it is opened, so the reveal has to happen then rather than on
	// mount — which is what made the active file sit off-screen in a long tree.
	await page.getByRole('button', { name: 'Files' }).click();

	const tree = page.getByRole('complementary', { name: 'Repository files' });

	await expect(tree).toBeVisible();
	await expect(tree.locator('.row a[aria-current="page"]')).toBeInViewport();
});

test('the phone file drawer closes on navigation and reveals the new active file when reopened', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 780 });
	await page.goto(`${BASE}/crates/generated/src/module900.rs`);
	await expect(page.locator('.header[data-hydrated]')).toBeVisible();

	await page.getByRole('button', { name: 'Files' }).click();

	const tree = page.getByRole('complementary', { name: 'Repository files' });

	await expect(tree.locator('.row a[aria-current="page"]')).toBeInViewport();
	await tree.getByLabel('Filter repository files').fill('module901');
	await tree.getByRole('link', { name: 'module901.rs' }).click();

	await expect(page).toHaveURL(`${BASE}/crates/generated/src/module901.rs`);
	await expect(tree).not.toBeVisible();

	await page.getByRole('button', { name: 'Files' }).click();

	await expect(tree).toBeVisible();
	await expect(tree.locator('.row a[aria-current="page"]')).toHaveText('module901.rs');
	await expect(tree.locator('.row a[aria-current="page"]')).toBeInViewport();
});
