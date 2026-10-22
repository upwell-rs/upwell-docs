/** Shared source-viewer inventory contracts and route eligibility rules. */

export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export interface SourceFileEntry {
	readonly path: string;
	readonly bytes: number;
}

/** True when an inventory entry has an emitted, renderable source-viewer file route. */
export function isViewableSourceEntry(entry: SourceFileEntry): boolean {
	return entry.bytes <= MAX_SOURCE_BYTES && isViewableSourcePath(entry.path);
}

/** True when a path has a source-viewer-supported textual format. */
export function isViewableSourcePath(file: string): boolean {
	return file.split('/').at(-1) !== 'Cargo.lock'
		&& /(?:^|\/)(?:Cargo\.toml|README(?:\.[^/]*)?|LICENSE(?:\.[^/]*)?|rust-toolchain(?:\.toml)?)$|\.(?:rs|toml|md|txt|json|ya?ml)$/i.test(file);
}
