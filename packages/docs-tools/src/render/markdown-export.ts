/**
 * The Markdown behind a documentation page, for readers that are not browsers.
 *
 * A `.svx` page is Markdown plus a handful of Svelte components, and a language model asking for the
 * page wants the first part without the second. Stripping the component layer leaves the prose, the
 * headings, and — the reason this exists at all — the code blocks intact, which the search index's
 * flattened prose throws away.
 *
 * The components are removed rather than rendered: `<Example>` groups blocks that are already
 * adjacent, `<Tabs>` shows one of several alternatives that are all worth reading, and a snippet
 * block is scaffolding for the tab it feeds. Dropping the wrapper and keeping what is inside it is
 * the faithful reading in every one of those cases.
 */

/** Components whose content is the page's content, so only their tags come out. */
const CONTENT_TAGS = ['Example', 'Steps', 'Tabs', 'Callout', 'Badge', 'PackageInstall', 'ReferenceNote'];

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script>\s*/gi;
const SNIPPET_BLOCK = /^[ \t]*\{[#/]snippet[^}]*\}[ \t]*\r?\n?/gm;
const SYMBOL_TAG = /<Symbol\b([^>]*?)\/>/gi;
const ATTRIBUTE = (name: string): RegExp => new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i');
const EXTRA_BLANK_LINES = /\n{3,}/g;

/** Renders one page's source as plain Markdown, with its Svelte layer removed. */
export function markdownFromPageSource(source: string): string {
	const tags = new RegExp(`^[ \\t]*</?(?:${CONTENT_TAGS.join('|')})\\b[^>]*>[ \\t]*\\r?\\n?`, 'gim');

	return `${source
		.replace(FRONTMATTER, '')
		.replace(SCRIPT_BLOCK, '')
		.replace(SYMBOL_TAG, (_match, attributes: string) => symbolText(attributes))
		.replace(tags, '')
		.replace(SNIPPET_BLOCK, '')
		.replace(EXTRA_BLANK_LINES, '\n\n')
		.trim()}\n`;
}

/**
 * A symbol reference as code, since that is what it reads as in prose.
 *
 * The label is what the author chose to show — `#[component]` rather than the path it resolves to —
 * and the path is the honest fallback when they chose nothing.
 */
function symbolText(attributes: string): string {
	const label = ATTRIBUTE('label').exec(attributes)?.[1];
	const path = ATTRIBUTE('path').exec(attributes)?.[1];
	const text = label ?? path;

	return text ? `\`${text}\`` : '';
}
