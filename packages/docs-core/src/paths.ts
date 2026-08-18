/** Path arithmetic shared by anything that resolves a link written inside a document. */

/**
 * Resolves a relative reference against the directory of the file that wrote it.
 *
 * A document's links are relative to the document, not to the site: `advanced` beside
 * `di/components` is `di/advanced`, and `../framework/app-macro` climbs out of `di` first. Returns
 * null for a reference that names nothing inside the tree — one that climbs past the root, or that
 * carries a scheme and therefore was never relative at all.
 */
export function resolveRelativePath(directory: string, reference: string): string | null {
	if (reference === '' || reference.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(reference)) {
		return null;
	}

	const segments = reference.startsWith('/') || directory === '' ? [] : directory.split('/');

	for (const segment of reference.replace(/^\//, '').split('/')) {
		if (segment === '' || segment === '.') {
			continue;
		}

		if (segment === '..') {
			if (segments.length === 0) {
				return null;
			}

			segments.pop();

			continue;
		}

		segments.push(segment);
	}

	return segments.length > 0 ? segments.join('/') : null;
}

/** The directory holding a path, or the empty string when it sits at the root. */
export function directoryOf(path: string): string {
	return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}
