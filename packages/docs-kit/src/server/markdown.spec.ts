import { describe, expect, it } from 'vitest';

import { renderRustdocMarkdown, renderSourceMarkdown } from './markdown.ts';

describe('renderRustdocMarkdown', () => {
	it('renders common Rustdoc Markdown with shared server-side Shiki highlighting', async () => {
		const html = await renderRustdocMarkdown('# Title\n\nA **strong** and *small* [link](https://example.com).\n\n- one\n- two\n\n```rust\nlet x = 1 < 2;\n```');

		expect(html).toMatch(/<h2 id="[^"]*title">Title<\/h2>/);
		expect(html).toContain('<strong>strong</strong>');
		expect(html).toContain('<em>small</em>');
		expect(html).toContain('<a href="https://example.com">link</a>');
		expect(html).toContain('<ul>');
		expect(html).toContain('<figure class="code-block" data-language="rust">');
		expect(html).toContain('class="shiki shiki-themes github-light github-dark"');
		expect(html).toContain('<span style="--shiki-light:');
		expect(html).toContain('--shiki-dark:');
	});

	it('escapes raw HTML and rejects dangerous URL protocols', async () => {
		const html = await renderRustdocMarkdown('<script>alert(1)</script>\n\n[x](java\nscript:alert(1)) [y](data:text/html,boom) [safe](/docs/page)');

		expect(html).not.toContain('alert(1)</script>');
		expect(html).not.toContain('<script');
		expect(html).not.toContain('href="data:');
		expect(html).toContain('safe');
		expect(html).not.toContain('href="/docs/page"');
	});

	it('escapes code and attribute content', async () => {
		const html = await renderRustdocMarkdown('`<img onerror=alert(1)>`\n\n[link](https://example.com/&quot; onclick=&quot;x)\n\n```rust\n</code><img src=x onerror=alert(2)>\n```');

		expect(html).toMatch(/<code>(?:&lt;|&#x3C;)img onerror=alert\(1\)(?:&gt;|>)<\/code>/);
		expect(html).not.toMatch(/<a[^>]*\sonclick=/i);
		expect(html).not.toContain('<img');
		expect(html).not.toContain('</code><img');
	});

	it('does not parse underscores inside link targets as emphasis', async () => {
		const html = await renderRustdocMarkdown('[config](https://example.com/upwell_config/index.html)');

		expect(html).toContain('href="https://example.com/upwell_config/index.html"');
		expect(html).not.toContain('<em>');
	});

	it('renders GFM tables and Rustdoc code-fence flags', async () => {
		const html = await renderRustdocMarkdown(
			'| Key | Effect |\n|---|---|\n| `name` | **Required** |\n\n```rust,ignore\napp! { name: "demo" }\n```\n\nAfter the block.'
		);

		expect(html).toContain('<table>');
		expect(html).toContain('<th>Key</th>');
		expect(html).toContain('<td><code>name</code></td>');
		expect(html).toContain('data-language="rust"');
		expect(html).toContain('app!');
		expect(html).toContain('<p>After the block.</p>');
	});

	it('renders unresolved Rustdoc-relative links as text', async () => {
		const html = await renderRustdocMarkdown('[ConfigProperties](trait.ConfigProperties.html) and [`iter`](#method.iter)');

		expect(html).toContain('ConfigProperties');
		expect(html).toContain('iter');
		expect(html).not.toContain('href=');
	});

	it.each([
		['rust,ignore', 'rust'],
		['rs no_run', 'rust'],
		['sh', 'shell'],
		['console', 'shell'],
		['ts', 'typescript'],
		['js', 'javascript'],
		['yml', 'yaml'],
		['compile_fail,E0123', 'rust'],
		['edition2024 should_panic', 'rust'],
		['text', 'text'],
		['unknown metadata', 'text']
	])('normalizes fence info %s to %s', async (info, language) => {
		const html = await renderRustdocMarkdown(`\`\`\`${info}\nlet value = true;\n\`\`\``);

		expect(html).toContain(`data-language="${language}"`);
	});

	it('defaults an empty explicit fence to Rust but leaves indented code as text', async () => {
		const fenced = await renderRustdocMarkdown('```\nlet fenced = true;\n```');
		const indented = await renderRustdocMarkdown('    let indented = true;');

		expect(fenced).toContain('data-language="rust"');
		expect(indented).toContain('data-language="text"');
	});
});

describe('renderSourceMarkdown', () => {
	// A README is written for its repository, so its links have files behind them. Only Rustdoc's
	// intra-doc links have nowhere to point.
	const context = {
		resolveLink: (url: string) => (url.endsWith('.png') ? null : `/docs/upwell/1.0.0/src/${url.replace(/^\.\//, '')}`),
		resolveImage: (url: string) => `https://raw.githubusercontent.com/upwell-rs/upwell/abc123/${url}`
	};

	it('points a fragment at the heading id the sanitizer emits', async () => {
		const html = await renderSourceMarkdown('## Usage\n\nSee [usage](#usage).', context);

		// The sanitizer prefixes ids from content, so the link has to name the prefixed one or it leads
		// nowhere.
		expect(html).toContain('id="user-content-usage"');
		expect(html).toContain('href="#user-content-usage"');
	});

	it('sends an embedded image to the bytes rather than to a page about them', async () => {
		const html = await renderSourceMarkdown('![logo](assets/logo.png)', context);

		expect(html).toContain('src="https://raw.githubusercontent.com/upwell-rs/upwell/abc123/assets/logo.png"');
	});

	it('resolves a repository-relative link through the caller', async () => {
		const html = await renderSourceMarkdown('Read the [guide](./docs/guide.md).', context);

		expect(html).toContain('href="/docs/upwell/1.0.0/src/docs/guide.md"');
	});

	it('reduces a link the caller cannot place to its label', async () => {
		const html = await renderSourceMarkdown('A [diagram](assets/plan.png) of it.', context);

		expect(html).toContain('diagram');
		expect(html).not.toContain('href=');
	});

	it('leaves absolute links alone with or without a caller', async () => {
		const html = await renderSourceMarkdown('[Home](https://example.com) and [mail](mailto:a@example.com).', context);

		expect(html).toContain('href="https://example.com"');
		expect(html).toContain('href="mailto:a@example.com"');
	});
});
