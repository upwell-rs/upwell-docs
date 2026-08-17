import { describe, expect, it } from 'vitest';

import {
	compareVersions,
	parseRequirement,
	parseVersion,
	satisfies,
	tryParseVersionDirectorySelector,
	tryParseVersion,
	versionsEqual
} from './semver.ts';

/** Parses without ceremony, for tests that are about comparison rather than parsing. */
function v(value: string) {
	return parseVersion(value, 'test');
}

/** Whether a version satisfies a requirement, both given as text. */
function matches(version: string, requirement: string): boolean {
	return satisfies(v(version), parseRequirement(requirement, 'test'));
}

describe('parseVersion', () => {
	it('parses a full version', () => {
		expect(v('1.2.3')).toMatchObject({ major: 1, minor: 2, patch: 3, prerelease: [], build: null });
	});

	it('treats missing components as zero, so a page may write a partial version', () => {
		expect(v('0.21')).toMatchObject({ major: 0, minor: 21, patch: 0 });
		expect(v('1')).toMatchObject({ major: 1, minor: 0, patch: 0 });
	});

	it('parses a prerelease into its identifiers', () => {
		expect(v('1.0.0-rc.1').prerelease).toEqual(['rc', 1]);
	});

	it('keeps build metadata separate', () => {
		expect(v('1.0.0+build.5')).toMatchObject({ build: 'build.5', prerelease: [] });
	});

	it('rejects something that is not a version', () => {
		expect(tryParseVersion('latest')).toBeUndefined();
		expect(tryParseVersion('0.2l.0')).toBeUndefined();
	});

	it('explains what it wanted', () => {
		expect(() => v('latest')).toThrowError(/is not a version: "latest"/);
	});
});

describe('tryParseVersionDirectorySelector', () => {
	it('preserves authored major, minor, and full precision', () => {
		expect(tryParseVersionDirectorySelector('1')).toMatchObject({ raw: '1', precision: 1, lower: { raw: '1', minor: 0, patch: 0 } });
		expect(tryParseVersionDirectorySelector('1.4')).toMatchObject({ raw: '1.4', precision: 2, lower: { raw: '1.4', patch: 0 } });
		expect(tryParseVersionDirectorySelector('1.4.0')).toMatchObject({ raw: '1.4.0', precision: 3, lower: { raw: '1.4.0' } });
	});

	it('allows prereleases only with a complete SemVer release', () => {
		expect(tryParseVersionDirectorySelector('1.4.0-rc.1')).toMatchObject({ precision: 3, lower: { prerelease: ['rc', 1] } });
		expect(tryParseVersionDirectorySelector('1-rc.1')).toBeUndefined();
		expect(tryParseVersionDirectorySelector('1.4-rc.1')).toBeUndefined();
	});

	it('rejects build metadata', () => {
		expect(tryParseVersionDirectorySelector('1.4.0+build.1')).toBeUndefined();
	});
});

describe('compareVersions', () => {
	it('orders by numeric component, not lexically', () => {
		// The range this framework is in: "0.20.0" sorts before "0.9.0" as a string.
		expect(compareVersions(v('0.9.0'), v('0.20.0'))).toBeLessThan(0);
	});

	it('orders major above minor above patch', () => {
		expect(compareVersions(v('1.0.0'), v('0.99.99'))).toBeGreaterThan(0);
		expect(compareVersions(v('0.20.1'), v('0.20.0'))).toBeGreaterThan(0);
	});

	it('sorts a prerelease below the release it precedes', () => {
		// So a page gated on 1.0.0 stays hidden during 1.0.0's own release candidates.
		expect(compareVersions(v('1.0.0-rc.1'), v('1.0.0'))).toBeLessThan(0);
	});

	it('orders prerelease identifiers, numerically where they are numbers', () => {
		expect(compareVersions(v('1.0.0-alpha.2'), v('1.0.0-alpha.10'))).toBeLessThan(0);
		expect(compareVersions(v('1.0.0-alpha'), v('1.0.0-beta'))).toBeLessThan(0);
	});

	it('ranks a numeric identifier below an alphanumeric one', () => {
		expect(compareVersions(v('1.0.0-1'), v('1.0.0-alpha'))).toBeLessThan(0);
	});

	it('ranks more identifiers above fewer when the prefix matches', () => {
		expect(compareVersions(v('1.0.0-alpha.1'), v('1.0.0-alpha'))).toBeGreaterThan(0);
	});

	it('ignores build metadata, as the specification requires', () => {
		expect(versionsEqual(v('1.0.0+a'), v('1.0.0+b'))).toBe(true);
	});

	it('treats a partial version as equal to its zero-filled form', () => {
		expect(versionsEqual(v('0.21'), v('0.21.0'))).toBe(true);
	});
});

describe('parseRequirement', () => {
	it('accepts any version', () => {
		expect(matches('0.1.0', '*')).toBe(true);
		expect(matches('9.9.9', '*')).toBe(true);
	});

	it('treats a bare version as a caret requirement, as Cargo does', () => {
		expect(matches('1.2.3', '1.2.3')).toBe(true);
		expect(matches('1.9.0', '1.2.3')).toBe(true);
		expect(matches('2.0.0', '1.2.3')).toBe(false);
	});

	it('reads explicit comparators', () => {
		expect(matches('1.0.0', '>=1.0')).toBe(true);
		expect(matches('0.9.0', '>=1.0')).toBe(false);
		expect(matches('1.0.0', '>1.0')).toBe(false);
		expect(matches('1.0.1', '>1.0')).toBe(true);
		expect(matches('0.9.0', '<1.0')).toBe(true);
		expect(matches('1.0.0', '<=1.0')).toBe(true);
	});

	it('reads an exact requirement', () => {
		expect(matches('1.2.3', '=1.2.3')).toBe(true);
		expect(matches('1.2.4', '=1.2.3')).toBe(false);
	});

	it('requires every comma-separated bound to hold', () => {
		expect(matches('0.21.0', '>=0.20, <1.0')).toBe(true);
		expect(matches('1.0.0', '>=0.20, <1.0')).toBe(false);
		expect(matches('0.19.0', '>=0.20, <1.0')).toBe(false);
	});

	describe('caret', () => {
		it('holds the major fixed at or above 1.0', () => {
			expect(matches('1.9.9', '^1.2')).toBe(true);
			expect(matches('2.0.0', '^1.2')).toBe(false);
		});

		it('holds the minor fixed below 1.0, because a 0.x minor bump is breaking', () => {
			// The rule that matters here: the framework this site documents is pre-1.0.
			expect(matches('0.20.5', '^0.20')).toBe(true);
			expect(matches('0.21.0', '^0.20')).toBe(false);
		});

		it('treats a bare major as spanning that major', () => {
			expect(matches('0.99.0', '^0')).toBe(true);
			expect(matches('1.0.0', '^0')).toBe(false);
		});
	});

	describe('tilde', () => {
		it('allows patch changes when a minor is given', () => {
			expect(matches('1.2.9', '~1.2')).toBe(true);
			expect(matches('1.3.0', '~1.2')).toBe(false);
		});

		it('allows minor changes when only a major is given', () => {
			expect(matches('1.9.0', '~1')).toBe(true);
			expect(matches('2.0.0', '~1')).toBe(false);
		});
	});

	it('rejects an unreadable requirement', () => {
		expect(() => parseRequirement('>=latest', 'test')).toThrowError(/unreadable version/);
	});

	it('rejects an empty requirement', () => {
		expect(() => parseRequirement('   ', 'test')).toThrowError(/empty version requirement/);
	});
});
