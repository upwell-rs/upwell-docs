import { describe, expect, it } from 'vitest';

import { docsConfig } from '../../../../docs.config.ts';
import { latestVersion } from '../config.ts';
import { parseVersion } from '../version/semver.ts';
import { buildGuideTree, navigationLeaves } from './navigation-tree.ts';
import { findPage, guideLeafOrder, pagesFor, siblings, slugs } from './pages.ts';

/**
 * These import the real content directory rather than fixtures, which is the point: the module
 * builds its page list during evaluation, so importing it at all is what proves that evaluation
 * succeeds.
 *
 * That is not hypothetical. An earlier version memoised section ranks in a module-level `let`
 * declared below the code that used it — a temporal dead zone error that the production bundler
 * hid by reordering declarations and the dev server did not, so the site built and deployed fine
 * while `dev` returned 500.
 */
describe('content index', () => {
	const version = latestVersion(docsConfig).releaseVersion;
	it('loads every authored page', () => {
		expect(slugs.length).toBeGreaterThan(0);
	});

	it('gives every page a title without requiring a configured group', () => {
		for (const page of pagesFor(version)) {
			expect(page.title, page.slug).not.toBe('');
		}
	});

	it('derives slugs from the content path', () => {
		expect(findPage('getting-started', version)).toBeDefined();
	});

	it('selects path-gated content and uses the selected candidate range without fallback', () => {
		const legacy = parseVersion('0.20.0', 'test');
		const current = parseVersion('1.0.0', 'test');

		expect(findPage('components', legacy)?.title).toBe('Components and dependency injection');
		expect(findPage('di/components', current)?.title).toBe('Components and injection');
		expect(findPage('migration-to-1-0', legacy)).toBeDefined();
		expect(findPage('migration-to-1-0', current)).toBeUndefined();
		expect(findPage('introduction/new-runtime', parseVersion('0.20.0', 'test'))).toBeUndefined();
		expect(findPage('framework/new-runtime', parseVersion('1.0.0', 'test'))).toBeDefined();
		expect(findPage('release-compatibility', legacy)?.title).toBe('Release compatibility');
		expect(findPage('release-compatibility', current)?.title).toBe('Release compatibility');
	});

	it('walks siblings in depth-first guide leaf order', () => {
		const visible = guideLeafOrder(version);
		const sidebarOrder = navigationLeaves(buildGuideTree(pagesFor(version).filter((page) => !page.draft), '')).map((page) => page.id);
		const first = visible[0];

		expect(visible.map((page) => page.slug)).toEqual(sidebarOrder);
		expect(siblings(first.slug, version).previous).toBeUndefined();
		expect(siblings(first.slug, version).next?.slug).toBe(visible[1]?.slug);
	});

	it('returns no siblings for a slug that does not exist', () => {
		expect(siblings('no-such-page', version)).toEqual({});
	});
});
