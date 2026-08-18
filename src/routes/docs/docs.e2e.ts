import { expect, test } from '@playwright/test';

import { docsConfig } from '../../../docs.config.ts';
import { latestVersion } from '@upwell/docs-core/config';

/**
 * The release under test is read from the configuration rather than written into each URL.
 *
 * Version ids change as releases are added, and a suite that hardcodes one throughout fails for a
 * configuration update rather than for a regression.
 */
const VERSION = latestVersion(docsConfig).id;

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

test('the release picker falls back to the target landing page when a normalized page is unavailable', async ({ page }) => {
	await page.goto('/docs/1.0.0/framework/new-runtime');
	await expect(page.locator('.header[data-hydrated]')).toBeVisible();

	await page.getByRole('navigation', { name: 'Release' }).getByRole('combobox').selectOption('0.20.0');
	await expect(page).toHaveURL('/docs/0.20.0/getting-started');
});

test('versioned guide visibility uses normalized routes without a root Guides group', async ({ page }) => {
	await page.goto('/docs/0.20.0/release-compatibility');
	await expect(page.getByRole('heading', { level: 1, name: 'Release compatibility' })).toBeVisible();
	await page.goto('/docs/1.0.0/release-compatibility');
	await expect(page.getByRole('heading', { level: 1, name: 'Release compatibility' })).toBeVisible();

	await page.goto('/docs/0.20.0/components');
	await expect(page.getByRole('heading', { level: 1, name: 'Components and dependency injection' })).toBeVisible();
	await page.goto('/docs/1.0.0/di/components');
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

	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('searchbox').fill('release compatibility');
	await expect(page.locator('.search__result[href="/docs/0.20.0/release-compatibility"]')).toBeVisible();
});

test('the site root is the documentation', async ({ page }) => {
	await page.goto('/');

	// There is no landing page whose only content is a link to the documentation.
	await expect(page).toHaveURL(`/docs/${VERSION}/${docsConfig.landingSlug}`);
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('a guide renders with navigation', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	const sidebar = page.getByRole('navigation', { name: 'Documentation' });

	await expect(page.getByRole('heading', { level: 1, name: 'Components and injection' })).toBeVisible();
	// Scoped to the sidebar: the previous/next footer links to the same page, and an unscoped match
	// would be ambiguous rather than wrong.
	await expect(sidebar.getByRole('link', { name: 'Advanced dependency injection' })).toBeVisible();
	await expect(sidebar.getByRole('link', { name: 'Components and injection' })).toHaveAttribute('aria-current', 'page');
});

test('code blocks carry symbol metadata resolved at build time', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	const symbol = page.locator('[data-symbol="upwell::prelude::component"]').first();

	await expect(symbol).toBeVisible();
	// The signature and summary come from the framework's own rustdoc output, not from prose written
	// next to the snippet.
	await expect(symbol).toHaveAttribute('data-symbol-signature', /#\[component\]/);
	await expect(symbol).toHaveAttribute('data-symbol-doc', /.+/);
	await expect(symbol).toHaveAttribute('data-symbol-source', /github\.com\/upwell-rs\/upwell\/blob\//);
});

test('clicking a documented code symbol navigates to its canonical authored reference', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	const linked = page.locator('a[data-symbol="upwell::prelude::component"]').first();

	// The facade path resolves to the macro's canonical authored page. The markup is compiled once and
	// rendered for every release it applies to, so the version remains the one the reader selected.
	await expect(linked).toHaveAttribute('href', `/docs/upwell/${VERSION}/symbols/upwell_macros/component`);
	await linked.click();
	await expect(page).toHaveURL(`/docs/upwell/${VERSION}/symbols/upwell_macros/component`);
});

test('a symbol without an authored reference links to its generated declaration page', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/application-model`);

	const annotated = page.locator('[data-symbol="upwell::axum::App"]').first();

	await expect(annotated).toBeVisible();
	await expect(annotated).toHaveJSProperty('tagName', 'A');
	await expect(annotated).toHaveAttribute('href', `/docs/upwell/${VERSION}/symbols/upwell_axum/App`);
});

test('hovering a symbol shows its card', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	await page.locator('[data-symbol="upwell::prelude::component"]').first().hover();

	await expect(page.getByRole('tooltip')).toBeVisible();
	await expect(page.getByRole('tooltip')).toContainText('#[component]');
});

test('the card survives the pointer moving into it, so its links can be used', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	await page.locator('a[data-symbol="upwell::prelude::component"]').first().hover();

	const link = page.getByRole('tooltip').getByRole('link', { name: 'component' });

	// Closing on `mouseout` made these links unreachable by mouse: the pointer has to leave the token
	// and cross a gap to get to them.
	await link.hover();
	await expect(page.getByRole('tooltip')).toBeVisible();

	await link.click();
	await expect(page).toHaveURL(`/docs/upwell/${VERSION}/symbols/upwell_macros/component`);
});

test('a symbol referenced in prose gets the same treatment as one in code', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/axum/http`);

	// Not inside a code block: this one is written in a sentence.
	const inline = page.locator('code.symbol-ref [data-symbol="upwell::axum::HttpRequest"]').first();

	await expect(inline).toBeVisible();
	await expect(inline).toHaveAttribute('data-symbol-signature', /pub struct HttpRequest/);
	await expect(inline).toHaveAttribute('data-symbol-feature', 'axum');

	await inline.hover();
	await expect(page.getByRole('tooltip')).toBeVisible();
});

test('clicking a documented inline symbol navigates to its authored reference', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	const linked = page.locator('code.symbol-ref a[data-symbol="upwell::prelude::component"]').first();

	await expect(linked).toHaveAttribute('href', `/docs/upwell/${VERSION}/symbols/upwell_macros/component`);
	await linked.click();
	await expect(page).toHaveURL(`/docs/upwell/${VERSION}/symbols/upwell_macros/component`);
});

test('a documented symbol card keeps View source on GitHub', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	await page.locator('a[data-symbol="upwell::prelude::component"]').first().hover();

	const source = page.getByRole('tooltip').getByRole('link', { name: 'View source' });

	await expect(source).toHaveAttribute('href', /github\.com\/upwell-rs\/upwell\/blob\//);
});

test('sidebar state survives navigation, because the shell is a layout', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	const group = page
		.getByRole('navigation', { name: 'Documentation' })
		.locator('details[data-group-id="guides:axum"]');

	await expect(group).toHaveAttribute('open', '');
	await group.locator(':scope > summary').click();
	await expect(group).not.toHaveAttribute('open', '');

	// A layout is not remounted between pages that share it, so the collapsed group stays collapsed.
	await page.getByRole('link', { name: 'Advanced dependency injection' }).first().click();
	await expect(page).toHaveURL(`/docs/${VERSION}/di/advanced`);
	await expect(group).not.toHaveAttribute('open', '');
});

test('path-derived navigation opens every visible-directory ancestor without a root Guides group', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/axum/http`);

	const sidebar = page.getByRole('navigation', { name: 'Documentation' });
	const ancestors = ['guides:axum'];

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

	await protocols.locator('summary').click();
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
	await page.goto(`/docs/${VERSION}/di/components`);

	const sidebar = page.getByRole('navigation', { name: 'Documentation' });

	await sidebar.getByRole('button', { name: 'Web' }).click();

	await expect(sidebar.getByRole('link', { name: 'Components and injection' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(sidebar.locator('details[data-group-id="guides:axum"]')).toHaveCount(1);
});

test('guides and symbols have explicit, independent navigation', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	const guideSidebar = page.getByRole('navigation', { name: 'Documentation' });

	await expect(guideSidebar.getByRole('link', { name: 'API index' })).toHaveCount(0);
	await page.getByRole('navigation', { name: 'Documentation sections' }).getByRole('link', { name: 'Symbols' }).click();
	await expect(page).toHaveURL(`/docs/upwell/${VERSION}/symbols`);

	const sidebar = page.getByRole('navigation', { name: 'Symbols' });

	await expect(sidebar.getByRole('link', { name: 'All symbols' })).toHaveAttribute('aria-current', 'page');
	await expect(sidebar.locator('details[data-group-id="symbols:upwell_axum"]')).toHaveAttribute('open', '');
	await expect(sidebar.locator(`a[href="/docs/upwell/${VERSION}/symbols/upwell_axum/config/AxumConfig"]`)).toHaveCount(1);
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
	await page.goto(`/docs/${VERSION}/di/components`);

	// Shortcuts are registered on mount, so the page has to be interactive before a key means
	// anything. Waiting on a hydration-dependent element is more honest than a fixed delay.
	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeVisible();
	await page.locator('body').click({ position: { x: 5, y: 5 } });

	// Letters, not brackets: `[` and `]` need AltGr on Nordic layouts, so they cannot be pressed
	// unmodified and the matcher — which compares modifiers exactly — would never fire.
	await page.keyboard.press('p');

	await expect(page).toHaveURL(`/docs/${VERSION}/cargo-upwell/automation-and-extensions`);
});

test('Alt+arrow moves between pages too', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeVisible();
	await page.locator('body').click({ position: { x: 5, y: 5 } });

	await page.keyboard.press('Alt+ArrowRight');

	await expect(page).toHaveURL(`/docs/${VERSION}/di/advanced`);
});

test('page navigation follows the rendered sidebar leaf order', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	const sidebar = page.getByRole('navigation', { name: 'Documentation' });
	const sidebarLeaves = await sidebar.locator('.tree__link').evaluateAll((links) =>
		links
			.filter((link) => !link.getAttribute('href')?.includes('/symbols/'))
			.map((link) => new URL(link.getAttribute('href')!, window.location.origin).pathname)
	);
	const current = `/docs/${VERSION}/di/components`;
	const position = sidebarLeaves.indexOf(current);

	expect(position).toBeGreaterThan(0);
	expect(position).toBeLessThan(sidebarLeaves.length - 1);
	await expect(page.locator('[data-direction="previous"]')).toHaveAttribute('href', sidebarLeaves[position - 1]);
	await expect(page.locator('[data-direction="next"]')).toHaveAttribute('href', sidebarLeaves[position + 1]);
});

test('search finds a guide by a word in its body', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('searchbox').fill('choose one provider');

	// A heading match points into the section rather than the top of the page.
	const first = page.locator('.search__result').first();

	await expect(first).toBeVisible();
	await expect(first).toContainText('Advanced dependency injection');
	await expect(first).toHaveAttribute('href', /#choose-one-provider-or-use-them-all$/);
});

test('a kind filter narrows search to that kind', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('searchbox').fill('trait:Component');

	await expect(page.locator('.search__filter')).toContainText('trait');
	// Every result is a symbol; the guide that shares the word is excluded.
	await expect(page.locator('.search__result').first()).toContainText('Component');
	await expect(page.locator('.search__result', { hasText: 'Getting started' })).toHaveCount(0);
});

test('a documented symbol appears once, under its own kind, linking to its page', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('searchbox').fill('macro:component');

	// One record, not two: the symbol is reachable at several paths but is one thing, and the
	// hand-written page is where it should lead — not at a path with no page behind it.
	const result = page.locator(`.search__result[href="/docs/upwell/${VERSION}/symbols/upwell_macros/component"]`);

	await expect(result).toHaveCount(1);
	await expect(result).toContainText('component');
});

test('Escape closes the search dialog', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('searchbox').fill('component');

	// Escape must reach the dialog: a `type=search` input would swallow it to clear itself, and a
	// global Escape hotkey would swallow it before that.
	await page.keyboard.press('Escape');

	await expect(page.getByRole('searchbox')).toBeHidden();
});

test('arrowing through results keeps the highlighted one in view', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('searchbox').fill('component');

	const list = page.locator('.search__results');

	// The list has to overflow for this to mean anything.
	expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);

	for (let index = 0; index < 9; index += 1) {
		await page.keyboard.press('ArrowDown');
	}

	// Focus stays in the text field, so the browser will not scroll for the reader — the component
	// has to. Without that, arrowing moved the highlight out of sight.
	const visible = await list.evaluate((node) => {
		const current = node.querySelector('[aria-current="true"]');

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
	await page.goto(`/docs/${VERSION}/di/components`);
	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeVisible();
	await page.locator('body').click({ position: { x: 5, y: 5 } });

	await page.keyboard.press('/');
	await page.getByRole('searchbox').fill('advanced dependency injection');

	// The index is fetched when the dialog first opens, so there is nothing to choose until it
	// arrives. Waiting for a result is what a reader does too.
	await expect(page.locator('.search__result').first()).toBeVisible();
	await page.keyboard.press('Enter');

	await expect(page).toHaveURL(new RegExp(`/docs/${VERSION}/di/advanced`));
});

test('a macro invocation resolves, even though its name is lowercase', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/framework/app-macro`);

	// `app!` is reached through a glob import and is lowercase, so the caution that stops a bare
	// lowercase name being linked applies to it — but the `!` means it cannot be a local, which is
	// what lifts that caution. It also has to beat a module of the same name in another crate.
	const macro = page.locator('[data-symbol="upwell_macros::app"]').first();

	await expect(macro).toBeVisible();
	await expect(macro).toHaveAttribute('data-symbol-kind', 'proc_macro');
});

test('a local whose type the build worked out carries it', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	const local = page.locator('[data-variable-type]').first();

	// A variable is annotated but is not a symbol: it must not claim to be part of the framework.
	await expect(local).toBeVisible();
	await expect(local).toHaveJSProperty('tagName', 'SPAN');
	await expect(local).not.toHaveAttribute('data-symbol', /./);

	await local.hover();
	await expect(page.getByRole('tooltip')).toContainText('local');
});

test('search matches a camel-case name from separate words', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/axum/http`);

	await page.getByRole('button', { name: 'Search' }).click();
	// Cannot match as one substring: the space is not in the identifier.
	await page.getByRole('searchbox').fill('http request');

	await expect(page.locator('.search__result').first()).toContainText('HttpRequest');
});

test('search highlights what matched', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	await page.getByRole('button', { name: 'Search' }).click();
	await page.getByRole('searchbox').fill('component');

	// The highlight comes from the same pass that scored the result, so it marks the reason the
	// result was found rather than a second search over the text.
	await expect(page.locator('.search__result mark').first()).toBeVisible();
});

test('narrow viewports get navigation, which the sidebar cannot provide', async ({ page }) => {
	await page.setViewportSize({ width: 420, height: 800 });
	await page.goto(`/docs/${VERSION}/di/components`);

	// Below 60rem the sidebar is not laid out at all, so without this the site is readable but not
	// navigable — there is no way to reach another page.
	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeHidden();

	await page.getByRole('button', { name: 'Menu' }).click();

	const menu = page.getByRole('dialog', { name: 'Documentation navigation' });

	await expect(menu).toBeVisible();
	await menu.getByRole('link', { name: 'Advanced dependency injection' }).click();

	await expect(page).toHaveURL(`/docs/${VERSION}/di/advanced`);
	// The layout survives navigation, so nothing else would have dismissed the menu.
	await expect(menu).toBeHidden();
});

test('copying a code block confirms it, and the toaster loads only then', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);
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
	await page.goto(`/docs/${VERSION}/di/components`);

	// `AuditSink` is declared in the first block of the example and used in the second. The jump
	// target is a line in a different block, which is why the declaration carries its own block id.
	const use = page.locator('.code-block:has-text("FileAuditSink") [data-local="AuditSink"]').first();

	await expect(use).toHaveAttribute('data-local-line', /\d+/);

	const block = await use.getAttribute('data-local-block');
	const line = await use.getAttribute('data-local-line');

	await expect(page.locator(`#L${block}-${line}`)).toHaveCount(1);
});

test('a type from another crate is marked and links to its own documentation', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	const arc = page.locator('[data-external="alloc::sync::Arc"]').first();

	await expect(arc).toBeVisible();
	await expect(arc).toHaveAttribute('data-external-crate', 'alloc');
	// It leads away from this site, which is the whole point: Upwell does not document `Arc`.
	await expect(arc).toHaveAttribute('href', /doc\.rust-lang\.org/);

	await arc.hover();
	await expect(page.getByRole('tooltip')).toContainText('alloc');
});

test('an external trait is distinguishable from an external type', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

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
	await page.goto(`/docs/${VERSION}/di/components`);

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

	await page.goto(`/docs/${VERSION}/di/components`);
	await expect(page.getByRole('navigation', { name: 'Documentation', exact: true })).toBeVisible();

	// Annotation happens at build time, so what a reader downloads is finished markup — never the
	// 1.1 MB table of 5,132 external symbols that produced it.
	expect(payloads.some((path) => path.includes('externals'))).toBe(false);
});

test("another crate's type carries that crate's documentation on its card", async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

	// The summary comes from the standard library's own rustdoc output, when the toolchain has the
	// `rust-docs-json` component. Without it the card shows the path and the link and nothing else.
	const arc = page.locator('[data-external="alloc::sync::Arc"]').first();

	await expect(arc).toHaveAttribute('data-external-doc', /reference-counting/);
});

test('a let binding takes the type of the expression that produced it', async ({ page }) => {
	await page.goto(`/docs/${VERSION}/di/components`);

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
	await page.goto(`/docs/${VERSION}/extensions/plugins`);

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
