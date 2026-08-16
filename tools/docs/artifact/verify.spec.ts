import { describe, expect, it } from 'vitest';
import { type ArchiveEntry, assertSafePath, MAX_ENTRIES, verifyArchiveEntries, verifyChecksum } from './verify.ts';

function entry(entryPath: string, overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
	return { path: entryPath, size: 1, type: 'file', ...overrides };
}

/** The smallest listing that passes, so each test can vary exactly one thing. */
function validListing(...extra: ArchiveEntry[]): ArchiveEntry[] {
	return [entry('manifest.json'), entry('symbols/index.json'), ...extra];
}

describe('assertSafePath', () => {
	it('accepts an ordinary nested path', () => {
		expect(() => assertSafePath('sources/examples/http/src/greet.rs')).not.toThrow();
	});

	it('accepts a path with a leading ./', () => {
		expect(() => assertSafePath('./manifest.json')).not.toThrow();
	});

	it('rejects a parent traversal', () => {
		expect(() => assertSafePath('../../etc/passwd')).toThrowError(expect.objectContaining({ rejection: 'traversal-path' }));
	});

	it('rejects a traversal buried mid-path', () => {
		expect(() => assertSafePath('sources/../../outside')).toThrowError(expect.objectContaining({ rejection: 'traversal-path' }));
	});

	it('rejects an absolute path', () => {
		expect(() => assertSafePath('/etc/passwd')).toThrowError(expect.objectContaining({ rejection: 'absolute-path' }));
	});

	it('rejects a Windows drive path', () => {
		expect(() => assertSafePath('C:/windows/system32')).toThrowError(expect.objectContaining({ rejection: 'windows-path' }));
	});

	it('rejects backslash separators, which would sidestep the POSIX checks', () => {
		expect(() => assertSafePath('sources\\..\\..\\outside')).toThrowError(expect.objectContaining({ rejection: 'windows-path' }));
	});

	it('does not mistake a filename containing dots for a traversal', () => {
		expect(() => assertSafePath('sources/..hidden/file.rs')).not.toThrow();
	});
});

describe('verifyArchiveEntries', () => {
	it('accepts a well-formed listing', () => {
		expect(() => verifyArchiveEntries(validListing(entry('sources', { type: 'directory', size: 0 })), 1024)).not.toThrow();
	});

	it('rejects a symlink rather than resolving it', () => {
		const listing = validListing(entry('sources/link.rs', { type: 'symlink' }));

		expect(() => verifyArchiveEntries(listing, 1024)).toThrowError(expect.objectContaining({ rejection: 'unsafe-entry-type' }));
	});

	it('rejects a hard link', () => {
		const listing = validListing(entry('sources/link.rs', { type: 'link' }));

		expect(() => verifyArchiveEntries(listing, 1024)).toThrowError(expect.objectContaining({ rejection: 'unsafe-entry-type' }));
	});

	it('rejects an archive that is missing the manifest', () => {
		expect(() => verifyArchiveEntries([entry('symbols/index.json')], 1024)).toThrowError(
			expect.objectContaining({ rejection: 'missing-required-file', entry: 'manifest.json' })
		);
	});

	it('rejects an oversized download before looking at entries', () => {
		expect(() => verifyArchiveEntries(validListing(), 1024 ** 4)).toThrowError(
			expect.objectContaining({ rejection: 'archive-too-large' })
		);
	});

	it('rejects a decompression bomb', () => {
		const listing = validListing(entry('sources/big.rs', { size: 1024 ** 4 }));

		expect(() => verifyArchiveEntries(listing, 1024)).toThrowError(expect.objectContaining({ rejection: 'unpacked-too-large' }));
	});

	it('rejects an archive with too many entries', () => {
		const listing = [...validListing(), ...Array.from({ length: MAX_ENTRIES }, (_, index) => entry(`sources/${index}.rs`))];

		expect(() => verifyArchiveEntries(listing, 1024)).toThrowError(expect.objectContaining({ rejection: 'too-many-entries' }));
	});

	it('rejects a traversal entry inside an otherwise valid listing', () => {
		const listing = validListing(entry('../escape.rs'));

		expect(() => verifyArchiveEntries(listing, 1024)).toThrowError(expect.objectContaining({ rejection: 'traversal-path' }));
	});
});

describe('verifyChecksum', () => {
	it('accepts a matching digest regardless of case or surrounding whitespace', () => {
		expect(() => verifyChecksum('ABC123', '  abc123\n', 'upwell-docs-0.20.0.tar.zst')).not.toThrow();
	});

	it('rejects a mismatch and says the archive was not unpacked', () => {
		expect(() => verifyChecksum('abc123', 'def456', 'upwell-docs-0.20.0.tar.zst')).toThrowError(/has not been unpacked/);
	});
});
