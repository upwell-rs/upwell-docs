import { describe, expect, it } from 'vitest';

import { llmsTxt, robotsTxt } from './discovery.ts';

describe('robotsTxt', () => {
	it('allows the site and names the sitemap', () => {
		const robots = robotsTxt('https://docs.example.com', ['/docs/*/search.json']);

		expect(robots).toContain('User-agent: *');
		expect(robots).toContain('Allow: /');
		expect(robots).toContain('Disallow: /docs/*/search.json');
		expect(robots).toContain('Sitemap: https://docs.example.com/sitemap.xml');
	});
});

describe('llmsTxt', () => {
	it('writes a heading, a summary, and a link per page', () => {
		const text = llmsTxt('https://docs.example.com', {
			title: 'Upwell',
			summary: 'A Rust framework for daemons and network services.',
			notes: ['Markdown copies live under /llms.'],
			sections: [
				{ title: 'Guides', links: [{ title: 'Getting started', path: '/llms/1.0.0/getting-started', description: 'Build a first application.' }] },
				{ title: 'Empty', links: [] }
			]
		});

		expect(text).toContain('# Upwell\n\n> A Rust framework for daemons and network services.');
		expect(text).toContain('Markdown copies live under /llms.');
		expect(text).toContain('- [Getting started](https://docs.example.com/llms/1.0.0/getting-started): Build a first application.');
		// A section with nothing in it is left out rather than written as an empty heading.
		expect(text).not.toContain('## Empty');
	});
});
