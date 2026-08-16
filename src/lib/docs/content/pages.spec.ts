import { describe, expect, it } from 'vitest';

import { docsConfig, latestVersion } from '../config.ts';
import { findPage, pagesFor, sections, siblings, slugs } from './pages.ts';

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
	const version = latestVersion(docsConfig).frameworkVersion;
	it('loads every authored page', () => {
		expect(slugs.length).toBeGreaterThan(0);
	});

	it('gives every page a title and a section', () => {
		for (const page of pagesFor(version)) {
			expect(page.title, page.slug).not.toBe('');
			expect(page.section, page.slug).not.toBe('');
		}
	});

	it('derives slugs from the content path', () => {
		expect(findPage('getting-started', version)).toBeDefined();
	});

	it('orders sections by the lowest order any of their pages declares', () => {
		const grouped = sections(version);
		const ranks = grouped.map((group) => Math.min(...group.pages.map((page) => page.order)));

		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
	});

	it('walks siblings in sidebar order', () => {
		const visible = pagesFor(version);
		const first = visible[0];

		expect(siblings(first.slug, version).previous).toBeUndefined();
		expect(siblings(first.slug, version).next?.slug).toBe(visible[1]?.slug);
	});

	it('returns no siblings for a slug that does not exist', () => {
		expect(siblings('no-such-page', version)).toEqual({});
	});
});
