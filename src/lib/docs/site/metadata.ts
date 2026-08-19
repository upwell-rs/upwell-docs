export interface PageMetadata {
	readonly title: string;
	readonly description: string;
	readonly path: string;
	readonly version: string;
}

export interface ResolvedPageMetadata extends PageMetadata {
	readonly fullTitle: string;
	readonly url: string;
}

interface SiteIdentity {
	readonly name: string;
	readonly origin: string;
}

/** Resolves route-owned metadata against the app's public identity. */
export function resolvePageMetadata(metadata: PageMetadata, site: SiteIdentity): ResolvedPageMetadata {
	return {
		...metadata,
		fullTitle: `${metadata.title} · ${site.name} ${metadata.version}`,
		url: `${site.origin}${normalizeSitePath(metadata.path)}`
	};
}

/** Keeps canonical URLs on this site and strips query strings and fragments. */
export function normalizeSitePath(value: string): string {
	const path = value.trim() || '/';
	const local = new URL(path.startsWith('/') ? `https://site.invalid${path}` : `https://site.invalid/${path}`);

	return local.pathname;
}
