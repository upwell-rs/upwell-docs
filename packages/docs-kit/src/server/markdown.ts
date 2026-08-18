import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { renderCodeBlock, type Language } from '@upwell/docs-tools/render/highlight';

interface MarkdownNode {
	type: string;
	url?: string;
	lang?: string | null;
	depth?: number;
	value?: string;
	position?: {
		start: { line: number; column: number; offset?: number };
		end: { line: number; column: number; offset?: number };
	};
	children?: MarkdownNode[];
}

interface HtmlNode {
	type: string;
	tagName?: string;
	value?: string;
	children?: HtmlNode[];
}

const LANGUAGES = new Set<Language>(['rust', 'toml', 'bash', 'shell', 'typescript', 'javascript', 'json', 'yaml', 'text']);
const ALIASES: Readonly<Record<string, Language>> = {
	rs: 'rust',
	sh: 'shell',
	console: 'shell',
	ts: 'typescript',
	js: 'javascript',
	yml: 'yaml',
	plaintext: 'text'
};
const RUSTDOC_FLAG = /^(?:ignore|no_run|should_panic|compile_fail|edition(?:2015|2018|2021|2024)|E\d{4})$/i;

/**
 * Renders Rustdoc Markdown as inert HTML.
 *
 * Rustdoc comments are CommonMark plus GFM tables and Rust-specific code-fence flags. They are
 * data, never MDX: raw HTML is discarded, the resulting tree is sanitized, and unresolved
 * Rustdoc-relative/intra-doc links are reduced to their visible label instead of becoming broken
 * application routes.
 */
export async function renderRustdocMarkdown(markdown: string | null): Promise<string> {
	return renderMarkdown(markdown, true);
}

export interface SourceMarkdownContext {
	/**
	 * Points a link written inside the repository at something reachable, or returns null when it
	 * cannot be pointed anywhere and should be reduced to its label.
	 */
	readonly resolveLink: (url: string) => string | null;
}

/**
 * Renders a repository Markdown file without Rustdoc's heading-level adjustment.
 *
 * A README's links are ordinary links: `docs/guide.md` names a file in the repository and `#usage`
 * names a heading in the page being rendered. Only Rustdoc's intra-doc links need to disappear, so
 * this keeps fragments and hands relative URLs to the caller, which knows the repository they are
 * relative to.
 */
export async function renderSourceMarkdown(markdown: string | null, context?: SourceMarkdownContext): Promise<string> {
	return renderMarkdown(markdown, false, context);
}

async function renderMarkdown(markdown: string | null, rustdoc: boolean, context?: SourceMarkdownContext): Promise<string> {
	if (!markdown) {
		return '';
	}

	const rendered = await unified()
		.use(remarkParse)
		.use(remarkGfm)
			.use(normalizeMarkdown, markdown, rustdoc, context)
		.use(remarkRehype)
		.use(rehypeSlug)
		.use(rehypeSanitize)
		.use(highlightCodeBlocks)
		.use(rehypeStringify, { allowDangerousHtml: true })
		.process(markdown);

	return String(rendered);
}

/** Normalizes Rustdoc conventions before conversion to HTML. */
function normalizeMarkdown(markdown: string, rustdoc: boolean, context?: SourceMarkdownContext) {
	return (tree: MarkdownNode): void => {
		visit(tree, (node: MarkdownNode, index: number | undefined, parent: MarkdownNode | undefined) => {
			if (node.type === 'code') {
				const offset = node.position?.start.offset;
				const fenced = offset !== undefined && /^(?:`{3,}|~{3,})/.test(markdown.slice(offset));

				node.lang = normalizeFenceLanguage(node.lang, fenced);
			}

			if (rustdoc && node.type === 'heading' && node.depth) {
				// The generated page owns h1. Rustdoc's sections begin one level below it.
				node.depth = Math.min(node.depth + 1, 6);
			}

			if (node.type !== 'link' || !node.url || isSafeStandaloneLink(node.url) || index === undefined || !parent?.children) {
				return;
			}

			if (!rustdoc) {
				// A fragment already addresses the page this Markdown became, and every other relative
				// URL has a repository file behind it.
				if (node.url.startsWith('#')) {
					return;
				}

				const resolved = context?.resolveLink(node.url);

				if (resolved) {
					node.url = resolved;

					return;
				}
			}

			// Relative rustdoc HTML links and fragments need symbol-aware resolution. Until that data
			// is available, retaining the label is more honest than emitting a broken site URL.
			parent.children.splice(index, 1, ...(node.children ?? []));
		});
	};
}

export function normalizeFenceLanguage(info: string | null | undefined, fenced = true): Language {
	const tokens = (info ?? '').split(/[\s,]+/).filter(Boolean);

	for (const token of tokens) {
		const candidate = token.toLowerCase();
		const language = ALIASES[candidate] ?? (LANGUAGES.has(candidate as Language) ? (candidate as Language) : undefined);

		if (language) {
			return language;
		}
	}

	return fenced && (tokens.length === 0 || tokens.every((token) => RUSTDOC_FLAG.test(token))) ? 'rust' : 'text';
}

function highlightCodeBlocks() {
	return async (tree: HtmlNode): Promise<void> => {
		const blocks: HtmlNode[] = [];

		visit(tree, (node: HtmlNode) => {
			if (node.type === 'element' && node.tagName === 'pre' && node.children?.[0]?.tagName === 'code') {
				blocks.push(node);
			}
		});

		await Promise.all(
			blocks.map(async (node) => {
				const code = node.children?.[0];
				const language = code?.children?.[0]?.value === undefined ? 'text' : languageFromCodeNode(code);
				const value = code?.children?.map((child) => child.value ?? '').join('') ?? '';

				node.type = 'raw';
				node.value = await renderCodeBlock(value, language, null, {});
				delete node.tagName;
				delete node.children;
			})
		);
	};
}

function languageFromCodeNode(node: HtmlNode): Language {
	const properties = (node as HtmlNode & { properties?: { className?: string[] } }).properties;
	const languageClass = properties?.className?.find((name) => name.startsWith('language-'));
	const language = languageClass?.slice('language-'.length) as Language | undefined;

	return language && LANGUAGES.has(language) ? language : 'text';
}

function isSafeStandaloneLink(url: string): boolean {
	return /^(?:https?:\/\/|mailto:)/i.test(url);
}
