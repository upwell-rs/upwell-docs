function invalid(kind: string, value: string): never {
	throw new Error(`Invalid documentation ${kind}: "${value}".`);
}

/** Validates and normalizes a slash-separated authored guide slug. */
export function guideSlug(value: string): string {
	const normalized = value.replace(/^\/+|\/+$/g, '');

	if (normalized === '' || !normalized.split('/').every((part) => /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(part))) {
		return invalid('guide slug', value);
	}

	return normalized;
}

/** Validates and normalizes a guide heading fragment, accepting an optional leading `#`. */
export function guideFragment(value: string): string {
	const normalized = value.replace(/^#/, '');

	if (!/^[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?$/.test(normalized)) {
		return invalid('guide fragment', value);
	}

	return normalized;
}

/** Validates a Rust or slash-separated symbol path and returns route segments. */
export function symbolPath(value: string): string {
	const normalized = value.replace(/^(?:::|\/)+|(?:::|\/)+$/g, '');
	const parts = normalized.split(/::|\//);

	if (normalized === '' || parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part))) {
		return invalid('symbol path', value);
	}

	return parts.join('/');
}

/** Validates a Cargo package name used as a documentation source route segment. */
export function sourceCrate(value: string): string {
	const normalized = value.replace(/^\/+|\/+$/g, '');

	if (!/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(normalized)) {
		return invalid('source crate', value);
	}

	return normalized;
}

/** Normalizes a repository-relative path while rejecting traversal syntax. */
export function sourcePath(value: string): string {
	const normalized = value.replace(/^\/+|\/+$/g, '');
	const parts = normalized.split('/');

	if (normalized === '' || value.includes('\\') || value.includes('\0') || parts.some((part) => part === '' || part === '.' || part === '..')) {
		return invalid('source path', value);
	}

	return normalized;
}

/** Encodes each valid source path segment without changing its repository identity. */
export function encodeSourcePath(path: string): string {
	return sourcePath(path).split('/').map(encodeURIComponent).join('/');
}
