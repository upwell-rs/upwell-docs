/**
 * Verification of downloaded artifacts.
 *
 * A release artifact is external input: it arrives over the network, from a repository the docs
 * build does not control, and it is unpacked onto the machine running the build. Everything here
 * assumes the archive is hostile until proven otherwise.
 *
 * The rules are enforced on the archive's *listing*, before a single byte is extracted, so a
 * malicious entry is rejected rather than written and cleaned up afterwards.
 */

/** Largest archive the build will download, compressed. */
export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

/** Largest total size the build will unpack, guarding against decompression bombs. */
export const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;

/** Largest number of entries an archive may contain. */
export const MAX_ENTRIES = 20_000;

/** Why an archive was rejected. */
export type ArchiveRejection =
	| 'absolute-path'
	| 'traversal-path'
	| 'windows-path'
	| 'unsafe-entry-type'
	| 'too-many-entries'
	| 'archive-too-large'
	| 'unpacked-too-large'
	| 'missing-required-file';

export class ArchiveError extends Error {
	readonly rejection: ArchiveRejection;
	readonly entry?: string;

	constructor(rejection: ArchiveRejection, message: string, entry?: string) {
		super(message);

		this.name = 'ArchiveError';
		this.rejection = rejection;
		this.entry = entry;
	}
}

/** One archive member, as reported by listing the archive without extracting it. */
export interface ArchiveEntry {
	readonly path: string;
	readonly size: number;
	/** Regular files and directories are the only member types an artifact may contain. */
	readonly type: 'file' | 'directory' | 'symlink' | 'link' | 'other';
}

/** Files an artifact must contain to be usable at all. */
export const REQUIRED_ENTRIES: readonly string[] = ['manifest.json', 'symbols/index.json'];

/**
 * Rejects an archive listing that is unsafe or unusable.
 *
 * Symlinks and hard links are refused outright rather than resolved: an artifact has no legitimate
 * use for them, and permitting them means re-implementing link-target validation. Refusing an entire
 * category is a smaller thing to get right than validating each instance.
 */
export function verifyArchiveEntries(entries: readonly ArchiveEntry[], archiveBytes: number): void {
	if (archiveBytes > MAX_ARCHIVE_BYTES) {
		throw new ArchiveError(
			'archive-too-large',
			`Archive is ${archiveBytes} bytes, above the ${MAX_ARCHIVE_BYTES} byte limit.`
		);
	}

	if (entries.length > MAX_ENTRIES) {
		throw new ArchiveError('too-many-entries', `Archive contains ${entries.length} entries, above the ${MAX_ENTRIES} limit.`);
	}

	let unpacked = 0;

	for (const entry of entries) {
		assertSafePath(entry.path);

		if (entry.type === 'symlink' || entry.type === 'link' || entry.type === 'other') {
			throw new ArchiveError(
				'unsafe-entry-type',
				`Archive entry "${entry.path}" is a ${entry.type}. Artifacts may contain only regular files and directories.`,
				entry.path
			);
		}

		unpacked += entry.size;

		if (unpacked > MAX_UNPACKED_BYTES) {
			throw new ArchiveError(
				'unpacked-too-large',
				`Archive unpacks to more than ${MAX_UNPACKED_BYTES} bytes.`,
				entry.path
			);
		}
	}

	const present = new Set(entries.map((entry) => normalise(entry.path)));

	for (const required of REQUIRED_ENTRIES) {
		if (!present.has(required)) {
			throw new ArchiveError('missing-required-file', `Archive is missing required file "${required}".`, required);
		}
	}
}

/**
 * Rejects any path that could write outside the extraction directory.
 *
 * Checked on the raw archive path rather than on a resolved one: resolving first would normalise
 * away the very thing being detected on some platforms.
 */
export function assertSafePath(entryPath: string): void {
	const normalised = normalise(entryPath);

	if (entryPath.startsWith('/') || entryPath.startsWith('\\')) {
		throw new ArchiveError('absolute-path', `Archive entry "${entryPath}" is an absolute path.`, entryPath);
	}

	if (/^[a-zA-Z]:/.test(entryPath) || entryPath.includes('\\')) {
		throw new ArchiveError('windows-path', `Archive entry "${entryPath}" uses a Windows path. Artifact paths are POSIX.`, entryPath);
	}

	if (normalised.split('/').some((segment) => segment === '..')) {
		throw new ArchiveError('traversal-path', `Archive entry "${entryPath}" escapes the extraction directory.`, entryPath);
	}
}

/** Strips a leading `./` and collapses repeated separators, without resolving `..`. */
function normalise(entryPath: string): string {
	return entryPath
		.replace(/^\.\//, '')
		.replace(/\/+/g, '/')
		.replace(/\/$/, '');
}

/** Rejects a checksum mismatch between the downloaded archive and the published digest. */
export function verifyChecksum(actual: string, expected: string, archiveName: string): void {
	if (actual.toLowerCase() !== expected.trim().toLowerCase()) {
		throw new Error(
			`Checksum mismatch for ${archiveName}.\n\n  Expected: ${expected.trim()}\n  Actual:   ${actual}\n\nThe download is corrupt or has been tampered with. It has not been unpacked.`
		);
	}
}
