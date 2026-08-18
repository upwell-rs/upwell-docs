/**
 * The files that tell other machines what this site contains.
 *
 * `robots.txt` says what may be fetched and where the map is. `llms.txt` is the map written for
 * something that reads rather than indexes — a short index with a sentence per page, pointing at
 * Markdown copies instead of at pages whose content is wrapped in an application. The sitemap itself
 * is `super-sitemap`'s: it derives the route list from the routes on disk and refuses to build until
 * every parameterized one is either given values or excluded, which is a guarantee a hand-written
 * enumeration cannot make.
 *
 * These matter more here than on a site whose pages are all in its HTML. The reference tree renders
 * only what is expanded and the symbol index renders only the rows in view, so a crawler that
 * follows links alone now sees a fraction of what exists.
 */

export interface LlmsSection {
	readonly title: string;
	readonly links: readonly { readonly title: string; readonly path: string; readonly description?: string }[];
}

export interface LlmsIndex {
	readonly title: string;
	readonly summary: string;
	readonly notes?: readonly string[];
	readonly sections: readonly LlmsSection[];
}

/**
 * Renders `robots.txt`.
 *
 * Everything is allowed except the JSON the application fetches for itself: a search index and a
 * navigation payload are not pages, and a crawler spending its budget on them finds no prose.
 */
export function robotsTxt(origin: string, disallow: readonly string[] = []): string {
	const rules = ['User-agent: *', 'Allow: /', ...disallow.map((path) => `Disallow: ${path}`)];

	return `${rules.join('\n')}\n\nSitemap: ${origin}/sitemap.xml\n`;
}

/** Renders an `llms.txt` index: a heading, a summary, then linked sections. */
export function llmsTxt(origin: string, index: LlmsIndex): string {
	const sections = index.sections
		.filter((section) => section.links.length > 0)
		.map((section) => {
			const links = section.links.map((link) => {
				const description = link.description ? `: ${link.description}` : '';

				return `- [${link.title}](${origin}${link.path})${description}`;
			});

			return `## ${section.title}\n\n${links.join('\n')}\n`;
		});
	const notes = index.notes?.length ? `${index.notes.join('\n\n')}\n\n` : '';

	return `# ${index.title}\n\n> ${index.summary}\n\n${notes}${sections.join('\n')}`;
}
