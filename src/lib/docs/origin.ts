/**
 * Normalizing the origin the site publishes itself under.
 *
 * Separate from the environment declaration so it can be tested, and strict because the value has one
 * job: absolute URLs in `sitemap.xml`, `robots.txt` and `llms.txt`. A malformed origin is not a
 * cosmetic problem — the sitemap library rejects it and the build fails after several minutes, with
 * an error that names the library rather than the variable.
 *
 * A bare host is accepted deliberately. Every domain a platform hands you is bare — Railway's
 * `RAILWAY_PUBLIC_DOMAIN` and `RAILWAY_STATIC_URL`, Vercel's `VERCEL_URL` — so `SITE_ORIGIN` being set
 * from one of those is the expected case, not a mistake to punish.
 */

const DEVELOPMENT_ORIGIN = 'http://localhost:3000';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function normalizeSiteOrigin(value: string | undefined): string {
	const trimmed = value?.trim();

	if (!trimmed) {
		return DEVELOPMENT_ORIGIN;
	}

	// A scheme-less value is a host, and a local one is being served over http.
	const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
		? ''
		: LOCAL_HOSTS.has(trimmed.split(':')[0])
			? 'http://'
			: 'https://';

	try {
		const url = new URL(`${scheme}${trimmed}`);

		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			throw new Error('not http');
		}

		// `origin` drops a path, a query and a trailing slash, none of which an origin has.
		return url.origin;
	} catch {
		throw new Error(
			`SITE_ORIGIN must be an origin such as "https://docs.example.com" or a host such as "docs.example.com". Received "${trimmed}".`
		);
	}
}
