import { describe, expect, it } from 'vitest';

import { parseVersion } from '../version/semver.ts';
import { ALWAYS, appliesTo, compileRange } from './applies.ts';

function v(value: string) {
	return parseVersion(value, 'test');
}

/** Compiles a declared range and asks whether a version is covered by it. */
function covers(range: Parameters<typeof compileRange>[0], version: string): boolean {
	return appliesTo(compileRange(range, 'a page'), v(version));
}

describe('appliesTo', () => {
	it('applies to every version when unbounded', () => {
		expect(appliesTo(ALWAYS, v('0.20.0'))).toBe(true);
		expect(covers({}, '9.9.9')).toBe(true);
	});

	it('hides a page until the version it documents ships', () => {
		// The workflow this exists for: the release tool cuts the version at release time, so a page
		// for an unreleased feature names a version that does not exist yet and appears by itself.
		expect(covers({ since: '0.21.0' }, '0.20.0')).toBe(false);
		expect(covers({ since: '0.21.0' }, '0.21.0')).toBe(true);
		expect(covers({ since: '0.21.0' }, '0.22.0')).toBe(true);
	});

	it('excludes versions after until', () => {
		expect(covers({ until: '0.20.0' }, '0.21.0')).toBe(false);
		expect(covers({ until: '0.20.0' }, '0.20.0')).toBe(true);
	});

	it('treats both bounds as inclusive', () => {
		const range = { since: '0.20.0', until: '1.0.0' };

		expect(covers(range, '0.19.0')).toBe(false);
		expect(covers(range, '0.20.0')).toBe(true);
		expect(covers(range, '1.0.0')).toBe(true);
		expect(covers(range, '1.0.1')).toBe(false);
	});

	it('accepts a bound written with fewer components', () => {
		expect(covers({ since: '0.21' }, '0.21.0')).toBe(true);
		expect(covers({ since: '0.21' }, '0.20.9')).toBe(false);
	});

	it('compares numerically, not lexically', () => {
		expect(covers({ since: '0.9.0' }, '0.20.0')).toBe(true);
	});

	it('keeps a page gated on a release hidden during that release’s candidates', () => {
		expect(covers({ since: '1.0.0' }, '1.0.0-rc.1')).toBe(false);
		expect(covers({ since: '1.0.0' }, '1.0.0')).toBe(true);
	});

	describe('requirement form', () => {
		it('accepts a Cargo-style requirement', () => {
			expect(covers({ versions: '>=0.21, <1.0' }, '0.25.0')).toBe(true);
			expect(covers({ versions: '>=0.21, <1.0' }, '1.0.0')).toBe(false);
			expect(covers({ versions: '>=0.21, <1.0' }, '0.20.0')).toBe(false);
		});

		it('reads a caret requirement with pre-1.0 semantics', () => {
			expect(covers({ versions: '^0.20' }, '0.20.9')).toBe(true);
			expect(covers({ versions: '^0.20' }, '0.21.0')).toBe(false);
		});

		it('accepts an exact requirement', () => {
			expect(covers({ versions: '=0.20.0' }, '0.20.0')).toBe(true);
			expect(covers({ versions: '=0.20.0' }, '0.20.1')).toBe(false);
		});
	});
});

describe('compileRange', () => {
	it('rejects a bound that is not a version', () => {
		expect(() => compileRange({ since: '0.2l.0' }, 'a page')).toThrowError(/is not a version/);
	});

	it('rejects a URL id, which is a label rather than a version', () => {
		expect(() => compileRange({ since: 'latest' }, 'a page')).toThrowError(/is not a version/);
	});

	it('names the offending field', () => {
		expect(() => compileRange({ until: 'v9' }, 'a page')).toThrowError(/"until"/);
	});

	it('rejects mixing the two forms, since one would silently win', () => {
		expect(() => compileRange({ versions: '>=1.0', since: '0.9.0' }, 'a page')).toThrowError(
			/declares both/
		);
	});

	it('accepts a version that has not been released yet', () => {
		// Existence is deliberately not checked: documentation is written before the release.
		expect(() => compileRange({ since: '99.0.0' }, 'a page')).not.toThrow();
	});
});
