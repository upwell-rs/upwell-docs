import {
	compareVersions,
	parseRequirement,
	parseVersion,
	satisfies,
	type SemVer,
	type VersionReq,
	VersionSyntaxError
} from './semver.ts';

export interface VersionRange {
	readonly since?: string;
	readonly until?: string;
	readonly versions?: string;
}

export interface CompiledRange {
	readonly requirement: VersionReq | null;
	readonly since: SemVer | null;
	readonly until: SemVer | null;
}

export const ALWAYS: CompiledRange = { requirement: null, since: null, until: null };

export function compileRange(range: VersionRange, describe: string): CompiledRange {
	const hasBounds = range.since !== undefined || range.until !== undefined;

	if (range.versions !== undefined && hasBounds) {
		throw new VersionSyntaxError(
			`${describe} declares both "versions" and "since"/"until". Use one form: "versions" for a requirement such as ">=0.21, <1.0", or "since"/"until" for plain bounds.`
		);
	}

	if (range.versions !== undefined) {
		return { requirement: parseRequirement(range.versions, `${describe} "versions"`), since: null, until: null };
	}

	return {
		requirement: null,
		since: range.since === undefined ? null : parseVersion(range.since, `${describe} "since"`),
		until: range.until === undefined ? null : parseVersion(range.until, `${describe} "until"`)
	};
}

export function appliesTo(range: CompiledRange, version: SemVer): boolean {
	if (range.requirement) {
		return satisfies(version, range.requirement);
	}

	if (range.since && compareVersions(version, range.since) < 0) {
		return false;
	}

	if (range.until && compareVersions(version, range.until) > 0) {
		return false;
	}

	return true;
}
