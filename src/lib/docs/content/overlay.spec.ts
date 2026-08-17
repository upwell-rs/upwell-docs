import { describe, expect, it } from 'vitest';

import { parseVersion } from '../version/semver.ts';
import { groupByPath, normalizeVersionPath, rejectRedundantSince, resolveCandidate } from './overlay.ts';

const v = (value: string) => parseVersion(value, 'test');

describe('path-derived version candidates', () => {
	it('removes selectors at leading, middle, and trailing depth', () => {
		expect(normalizeVersionPath('1/guide', 'test')).toMatchObject({ path: 'guide', selector: { raw: '1', precision: 1 } });
		expect(normalizeVersionPath('protocols/1.4/http', 'test')).toMatchObject({ path: 'protocols/http', selector: { raw: '1.4', precision: 2 } });
		expect(normalizeVersionPath('symbols/widget/1.0.0', 'test')).toMatchObject({ path: 'symbols/widget', selector: { raw: '1.0.0', precision: 3 } });
	});

	it('matches major selectors only for their stable major range', () => {
		const candidates = groupByPath([
			{ relativePath: 'guide', value: 'baseline' },
			{ relativePath: '1/guide', value: 'major' }
		], 'Guide').get('guide')!;

		expect(resolveCandidate(candidates, v('1.0.0-rc.1'))).toBe('baseline');
		expect(resolveCandidate(candidates, v('1.0.0'))).toBe('major');
		expect(resolveCandidate(candidates, v('1.99.99'))).toBe('major');
		expect(resolveCandidate(candidates, v('2.0.0'))).toBe('baseline');
	});

	it('matches minor selectors only for their stable minor range', () => {
		const candidates = groupByPath([
			{ relativePath: 'guide', value: 'baseline' },
			{ relativePath: '1.4/guide', value: 'minor' }
		], 'Guide').get('guide')!;

		expect(resolveCandidate(candidates, v('1.4.0-rc.1'))).toBe('baseline');
		expect(resolveCandidate(candidates, v('1.4.0'))).toBe('minor');
		expect(resolveCandidate(candidates, v('1.4.9'))).toBe('minor');
		expect(resolveCandidate(candidates, v('1.5.0'))).toBe('baseline');
	});

	it('selects full selectors at their lower boundary and carries them forward', () => {
		const candidates = groupByPath([
			{ relativePath: 'guide', value: 'baseline' },
			{ relativePath: 'guide/1.0.0', value: 'new' }
		], 'Guide').get('guide')!;

		expect(resolveCandidate(candidates, v('0.20.0'))).toBe('baseline');
		expect(resolveCandidate(candidates, v('1.0.0'))).toBe('new');
		expect(resolveCandidate(candidates, v('1.1.0'))).toBe('new');
	});

	it('selects full prerelease selectors at and after their lower boundary', () => {
		const candidates = groupByPath([
			{ relativePath: 'guide', value: 'baseline' },
			{ relativePath: '1.4.0-rc.1/guide', value: 'release-candidate' }
		], 'Guide').get('guide')!;

		expect(resolveCandidate(candidates, v('1.4.0-beta.1'))).toBe('baseline');
		expect(resolveCandidate(candidates, v('1.4.0-rc.1'))).toBe('release-candidate');
		expect(resolveCandidate(candidates, v('1.4.0'))).toBe('release-candidate');
	});

	it('prefers the highest eligible lower bound, then the most precise selector', () => {
		const candidates = groupByPath([
			{ relativePath: 'guide', value: 'baseline' },
			{ relativePath: '1/guide', value: 'major' },
			{ relativePath: '1.4/guide', value: 'minor' },
			{ relativePath: '1.4.0/guide', value: 'full' }
		], 'Guide').get('guide')!;

		expect(resolveCandidate(candidates, v('1.3.9'))).toBe('major');
		expect(resolveCandidate(candidates, v('1.4.0'))).toBe('full');
		expect(resolveCandidate(candidates, v('1.4.9'))).toBe('full');
		expect(resolveCandidate(candidates, v('1.5.0'))).toBe('full');
	});

	it('rejects the legacy @SemVer convention', () => {
		expect(() => normalizeVersionPath('@1.0.0/guide', 'Guide')).toThrow(/legacy version directory/);
	});

	it('rejects partial prereleases, build metadata, and multiple selectors', () => {
		expect(() => normalizeVersionPath('1-rc.1/guide', 'Guide')).toThrow(/invalid version selector/);
		expect(() => normalizeVersionPath('1.0.0+build.1/guide', 'Guide')).toThrow(/invalid version selector/);
		expect(() => normalizeVersionPath('1/guide/1.1', 'Guide')).toThrow(/more than one version selector/);
	});

	it('rejects duplicate selectors while allowing overlapping selectors', () => {
		expect(() => groupByPath([
			{ relativePath: '1/guide', value: 'first' },
			{ relativePath: '1/guide', value: 'second' }
		], 'Guide')).toThrow(/multiple candidates.*selector 1/);

		expect(() => groupByPath([
			{ relativePath: '1/guide', value: 'major' },
			{ relativePath: '1.0/guide', value: 'minor' }
		], 'Guide')).not.toThrow();
	});

	it('rejects redundant frontmatter since on a path-gated candidate', () => {
		const { selector } = normalizeVersionPath('1.0.0/guide', 'Guide');

		expect(() => rejectRedundantSince(selector, '1.0.0', 'Guide /src/content/docs/1.0.0/guide.svx')).toThrow(/must not also declare frontmatter "since"/);
		expect(() => rejectRedundantSince(selector, undefined, 'Guide /src/content/docs/1.0.0/guide.svx')).not.toThrow();
	});
});
