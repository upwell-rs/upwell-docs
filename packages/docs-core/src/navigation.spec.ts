import { describe, expect, it } from 'vitest';

import { buildGuideTree, buildSymbolTree, navigationLeaves } from './navigation.ts';
import type { DocSummary, NavigationNode } from './content.ts';

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

	it('derives the symbol hierarchy from navigable records', () => {
		const symbols = [{
			path: 'upwell_axum::config::AxumConfig',
			name: 'AxumConfig',
			href: '/docs/latest/symbols/upwell_axum/config/AxumConfig',
			kind: 'struct',
			topics: ['web']
		}];

		expect(ids(buildSymbolTree(symbols))).toEqual([
			'symbols:upwell_axum',
			'symbols:upwell_axum/config',
			'symbols/upwell_axum/config/AxumConfig'
		]);
	});

	it('uses canonical destinations and collapses re-export aliases', () => {
		const href = '/docs/latest/symbols/upwell_macros/component';
		const tree = buildSymbolTree([
			{ path: 'upwell::prelude::component', name: 'component', href, kind: 'proc_macro' },
			{ path: 'upwell_macros::component', name: 'component', href, kind: 'proc_macro' }
		]);

		expect(ids(tree)).toEqual(['symbols:upwell_macros', 'symbols/upwell_macros/component']);
	});

	it('promotes a module page into its matching group', () => {
		const tree = buildSymbolTree([
			{ path: 'upwell::config', name: 'config', href: '/docs/latest/symbols/upwell/config', kind: 'module' },
			{ path: 'upwell::config::Config', name: 'Config', href: '/docs/latest/symbols/upwell/config/Config', kind: 'struct' }
		]);
		const module = tree[0].children[0];

		expect(ids(tree)).toEqual(['symbols:upwell', 'symbols:upwell/config', 'symbols/upwell/config/Config']);
		expect(module).toMatchObject({ type: 'group', href: '/docs/latest/symbols/upwell/config', pageId: 'symbols/upwell/config' });
	});
});
