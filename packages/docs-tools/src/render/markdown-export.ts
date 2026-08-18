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
 *
 * **Nothing is rewritten inside a fenced block.** A guide that demonstrates a component, or shows a
 * `<script>` in a Svelte example, means that text literally — and a transform that reached into code
 * would delete the very thing the page is about, silently, in the one output that promises to keep it.
 */

import { splitLocation } from '@upwell/docs-core/paths';

/** Components whose content is the page's content, so only their tags come out. */
const CONTENT_TAGS = ['Example', 'Steps', 'Tabs', 'Callout', 'Badge', 'PackageInstall', 'ReferenceNote'];

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script>\s*/gi;
const SNIPPET_BLOCK = /^[ \t]*\{[#/]snippet[^}]*\}[ \t]*\r?\n?/gm;
const SYMBOL_TAG = /<Symbol\b([^>]*?)\/>/gi;
/** A link, but not an image: an image's destination is a file, not a page, and takes no suffix. */
const LINK = /(?<!!)\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const ATTRIBUTE = (name: string): RegExp => new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i');
const EXTRA_BLANK_LINES = /\n{3,}/g;

export interface MarkdownExportOptions {
	/**
	 * Appended to relative links, so they point at the exported copies rather than the pages.
	 *
	 * A guide links its neighbours by slug — `[the advanced guide](advanced)` — which resolves beside
	 * whatever served it. Exported as `…/components.md`, that neighbour is `…/advanced.md`, and without
	 * the suffix the link lands on a path only the site serves.
	 */
	readonly relativeLinkSuffix?: string;
	/**
	 * Whether a relative destination names another exported page, which only the caller can know.
	 *
	 * Required for any rewriting to happen, because a relative link is not necessarily a page: a guide
	 * may link a configuration file or an archive, and `example.toml.md` is worse than the original.
	 * Asking instead of guessing also leaves a link to a page that does not exist exactly as written,
	 * which is the honest rendering of a mistake.
	 */
	readonly exports?: (destination: string) => boolean;
}

/** Renders one page's source as plain Markdown, with its Svelte layer removed. */
export function markdownFromPageSource(source: string, options: MarkdownExportOptions = {}): string {
	const tags = new RegExp(`^[ \\t]*</?(?:${CONTENT_TAGS.join('|')})\\b[^>]*>[ \\t]*\\r?\\n?`, 'gim');
	const prose = (text: string): string =>
		text
			.replace(SCRIPT_BLOCK, '')
			.replace(SYMBOL_TAG, (_match, attributes: string) => symbolText(attributes))
			.replace(tags, '')
			.replace(SNIPPET_BLOCK, '')
			.replace(LINK, (match, label: string, target: string, title: string) => relinked(match, label, target, title, options))
			.replace(EXTRA_BLANK_LINES, '\n\n');

	return `${outsideCode(source.replace(FRONTMATTER, ''), prose).trim()}\n`;
}

/**
 * Applies a transform to the prose of a document, leaving fenced blocks exactly as they are.
 *
 * Whole runs of prose are handed over rather than single lines, because what is being removed spans
 * lines: a `<script>` block, or a wrapper and the blank line after it.
 */
function outsideCode(source: string, transform: (text: string) => string): string {
	const output: string[] = [];
	let prose: string[] = [];
	let fence: string | undefined;

	const flush = (): void => {
		if (prose.length > 0) {
			output.push(transform(prose.join('\n')));
			prose = [];
		}
	};

	for (const line of source.split('\n')) {
		const marker = FENCE.exec(line)?.[1];

		if (fence) {
			output.push(line);

			// A fence closes on the same character, at least as long as the one that opened it.
			if (marker && marker[0] === fence[0] && marker.length >= fence.length) {
				fence = undefined;
			}

			continue;
		}

		if (marker) {
			flush();
			output.push(line);
			fence = marker;

			continue;
		}

		prose.push(line);
	}

	flush();

	return output.join('\n');
}

/** Points a relative link at the exported copy, keeping whatever it said about the destination. */
function relinked(match: string, label: string, target: string, title: string, options: MarkdownExportOptions): string {
	const suffix = options.relativeLinkSuffix;
	const absolute = target.startsWith('/') || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target);

	if (!suffix || !options.exports || absolute) {
		return match;
	}

	// The query and fragment are said about the page rather than being part of its name, so the
	// suffix goes before them and the caller is asked about the path alone.
	const { path, suffix: said } = splitLocation(target);

	if (path === '' || path.endsWith(suffix) || !options.exports(path)) {
		return match;
	}

	return `[${label}](${path}${suffix}${said}${title})`;
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
