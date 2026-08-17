import { describe, expect, it } from 'vitest';

import { buildApiTree, buildGuideTree, navigationLeaves } from './navigation.ts';
import type { DocSummary, NavigationNode, SymbolPageSummary } from './content.ts';

const page = (slug: string, topics: readonly string[] = [], order = 0): DocSummary => ({
	slug,
	title: slug,
	order,
	draft: false,
	topics
});

function ids(nodes: readonly NavigationNode[]): string[] {
	return nodes.flatMap((node) => [node.id, ...(node.type === 'group' ? ids(node.children) : [])]);
}

describe('navigation trees', () => {
	it('builds nested guide groups without a synthetic root', () => {
		const tree = buildGuideTree(
			[page('extensions/plugins/authoring/plugin-guide'), page('extensions/protocols/authoring/protocol-guide')],
			(slug) => `/docs/latest/${slug}`
		);

		expect(ids(tree)).toEqual([
			'guides:extensions',
			'guides:extensions/plugins',
			'guides:extensions/plugins/authoring',
			'extensions/plugins/authoring/plugin-guide',
			'guides:extensions/protocols',
			'guides:extensions/protocols/authoring',
			'extensions/protocols/authoring/protocol-guide'
		]);
	});

	it('keeps leaves in rendered depth-first order', () => {
		const tree = buildGuideTree(
			[page('zeta', [], 20), page('alpha/second', [], 10), page('alpha/first', [], 5), page('beta', [], 15)],
			(slug) => slug
		);

		expect(navigationLeaves(tree).map((leaf) => leaf.id)).toEqual(['alpha/first', 'alpha/second', 'beta', 'zeta']);
	});

	it('derives API hierarchy from authored symbol paths', () => {
		const symbols: SymbolPageSummary[] = [{
			symbol: 'upwell_axum::config::AxumConfig',
			segments: 'upwell_axum/config/AxumConfig',
			title: 'AxumConfig',
			draft: false,
			topics: ['web']
		}];

		expect(ids([buildApiTree(symbols, (segments) => `/docs/latest/symbols/${segments}`)])).toEqual([
			'api',
			'api:upwell_axum',
			'api:upwell_axum/config',
			'symbols/upwell_axum/config/AxumConfig'
		]);
	});
});
