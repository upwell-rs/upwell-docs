/**
 * Packaging an artifact directory into the release archive, and unpacking one back out.
 *
 * `tar` is invoked rather than reimplemented. Node has no tar or zstd support that covers both
 * directions, and shelling out keeps the archive a plain, inspectable `tar.zst` that a person can
 * open with the tools they already have.
 *
 * Unpacking lists the archive first, verifies the listing, and only then extracts, so nothing
 * untrusted is written to disk before it has been checked.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { type ArchiveEntry, verifyArchiveEntries } from './verify.ts';

const run = promisify(execFile);

/** A `tar` invocation that failed, or a tar binary that cannot do what is needed. */
export class ArchiveToolError extends Error {
	constructor(message: string) {
		super(message);

		this.name = 'ArchiveToolError';
	}
}

/** Release archive name for a framework version. */
export function archiveName(crate: string, version: string): string {
	return `${crate}-docs-${version}.tar.zst`;
}

/**
 * Packs an artifact directory into `<distDir>/<crate>-docs-<version>.tar.zst`.
 *
 * Entries are sorted and stripped of owner, mode and timestamp metadata so that packing the same
 * artifact twice produces the same bytes — a release asset should be reproducible from its commit.
 */
export async function packArtifact(artifactDir: string, distDir: string, crate: string, version: string): Promise<string> {
	const name = archiveName(crate, version);
	const destination = path.join(distDir, name);

	await rm(destination, { force: true });

	await tar([
		'--zstd',
		'--create',
		'--file', destination,
		'--directory', artifactDir,
		// Reproducibility: no owner identity, no access times, deterministic ordering.
		'--numeric-owner',
		'--owner=0',
		'--group=0',
		'--mtime=UTC 2020-01-01',
		'--sort=name',
		'.'
	]);

	const digest = await sha256(destination);

	await writeFile(`${destination}.sha256`, `${digest}  ${name}\n`, 'utf8');

	return destination;
}

/**
 * Verifies an archive's listing and extracts it into `destination`.
 *
 * The listing is obtained with `tar --list --verbose`, which reports type, size and path for each
 * member without writing anything.
 */
export async function unpackArtifact(archive: string, destination: string): Promise<void> {
	const info = await stat(archive);
	const entries = await listArchive(archive);

	verifyArchiveEntries(entries, info.size);

	await rm(destination, { recursive: true, force: true });
	await mkdir(destination, { recursive: true });

	await tar([
		'--zstd',
		'--extract',
		'--file', archive,
		'--directory', destination,
		// Belt and braces: the listing was already checked, but tar's own guards cost nothing.
		'--no-same-owner',
		'--no-same-permissions'
	]);
}

/**
 * Lists an archive without extracting it.
 *
 * `tar -tvf` output is parsed for the leading type character, the size and the path. Entries whose
 * shape is not understood are reported as `other`, which the verifier rejects — an unparseable
 * entry is never assumed to be harmless.
 */
async function listArchive(archive: string): Promise<ArchiveEntry[]> {
	const result = await tar(['--zstd', '--list', '--verbose', '--file', archive]);
	const lines = result.split('\n').filter((line) => line.trim() !== '');

	return lines.map(parseListingLine);
}

const LISTING = /^([-dlhs])\S*\s+\S+\s+(\d+)\s+\S+\s+\S+\s+(.+)$/;

function parseListingLine(line: string): ArchiveEntry {
	const match = LISTING.exec(line);

	if (!match) {
		return { path: line.trim(), size: 0, type: 'other' };
	}

	const [, kind, size, rest] = match;
	// tar renders links as `link -> target`; the path is everything before the arrow.
	const entryPath = rest.split(' -> ')[0].trim();

	return { path: entryPath, size: Number(size), type: entryType(kind) };
}

function entryType(kind: string): ArchiveEntry['type'] {
	if (kind === '-') {
		return 'file';
	}

	if (kind === 'd') {
		return 'directory';
	}

	if (kind === 'l') {
		return 'symlink';
	}

	if (kind === 'h') {
		return 'link';
	}

	return 'other';
}

async function tar(args: readonly string[]): Promise<string> {
	const result = await run('tar', [...args], { maxBuffer: 64 * 1024 * 1024 }).catch((cause: unknown) => {
		const message = cause instanceof Error ? ((cause as { stderr?: string }).stderr ?? cause.message) : String(cause);

		throw new ArchiveToolError(
			`tar failed.\n\n  tar ${args.join(' ')}\n\n${message}\n\nPacking and unpacking artifacts needs a tar with zstd support (GNU tar 1.31+, or bsdtar 3.4+).`
		);
	});

	return result.stdout;
}

export async function sha256(file: string): Promise<string> {
	const contents = await readFile(file);

	return createHash('sha256').update(contents).digest('hex');
}
