import { describe, expect, it } from 'vitest';

import { buildGuideTree, buildSymbolTree, filterNavigation, navigationLeaves } from './navigation.ts';
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

	it('promotes a directory index page into its group and orders the group by it', () => {
		const tree = buildGuideTree(
			[page('getting-started', [], 1), page('cargo-upwell', ['tooling'], 150), page('cargo-upwell/inspect', ['tooling'], 20)],
			(slug) => `/docs/latest/${slug}`
		);

		expect(ids(tree)).toEqual(['getting-started', 'guides:cargo-upwell', 'cargo-upwell/inspect']);
		expect(tree[1]).toMatchObject({
			type: 'group',
			label: 'cargo-upwell',
			href: '/docs/latest/cargo-upwell',
			pageId: 'cargo-upwell',
			order: 150,
			topics: ['tooling']
		});
	});

	it('gives a group without an index page the order of its earliest child', () => {
		const tree = buildGuideTree([page('reference', [], 5), page('framework/model', [], 20), page('framework/macro', [], 30)], (slug) => slug);

		expect(ids(tree)).toEqual(['reference', 'guides:framework', 'framework/model', 'framework/macro']);
	});

	it('counts a group entrypoint before its children in reading order', () => {
		const tree = buildGuideTree([page('tooling', [], 10), page('tooling/inspect', [], 20), page('after', [], 30)], (slug) => slug);

		expect(navigationLeaves(tree).map((leaf) => leaf.id)).toEqual(['tooling', 'tooling/inspect', 'after']);
	});

	it('keeps an entrypoint group when topic filtering hides every child', () => {
		const tree = buildGuideTree([page('tooling', ['tooling'], 10), page('tooling/inspect', ['web'], 20)], (slug) => slug);
		const filtered = filterNavigation(tree, (topics) => topics.includes('tooling'), '');

		expect(ids(filtered)).toEqual(['guides:tooling']);
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
