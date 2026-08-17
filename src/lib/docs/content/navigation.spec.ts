import { describe, expect, it } from 'vitest';

import { docsConfig, latestVersion } from '../config.ts';
import { buildGuideTree, navigationLeaves } from './navigation-tree.ts';
import { symbolPagesFor } from './symbol-pages.ts';
import type { DocSummary, NavigationNode, SymbolPageSummary } from './types.ts';
import { activeGroupIds, buildApiTree, filterNavigation } from './navigation.ts';

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

describe('recursive navigation', () => {
	it('builds nested guide groups from visible directories without a root Guides group', () => {
		const tree = buildGuideTree([page('extensions/plugins/authoring/plugin-guide'), page('extensions/protocols/authoring/protocol-guide')], 'latest');

		expect(ids(tree)).toEqual([
			'guides:extensions',
			'guides:extensions/plugins',
			'guides:extensions/plugins/authoring',
			'extensions/plugins/authoring/plugin-guide',
			'guides:extensions/protocols',
			'guides:extensions/protocols/authoring',
			'extensions/protocols/authoring/protocol-guide'
		]);
		expect(ids(tree)).not.toContain('guides');
	});

	it('opens every active ancestor', () => {
		const tree = buildGuideTree([page('root/branch/leaf/current')], 'latest');

		expect(activeGroupIds(tree, 'root/branch/leaf/current')).toEqual(new Set(['guides:root/branch/leaf', 'guides:root/branch', 'guides:root']));
	});

	it('flattens guide leaves in the same depth-first order it renders', () => {
		const tree = buildGuideTree([
			page('zeta', [], 20),
			page('alpha/second', [], 10),
			page('alpha/first', [], 5),
			page('beta', [], 15)
		], 'latest');

		expect(navigationLeaves(tree).map((leaf) => leaf.id)).toEqual([
			'alpha/first',
			'alpha/second',
			'beta',
			'zeta'
		]);
	});

	it('topic filtering retains matching ancestors and the current page orientation', () => {
		const tree = buildGuideTree([page('root/web/http', ['web']), page('root/jobs/worker', ['jobs']), page('root/jobs/current', ['jobs'])], 'latest');
		const filtered = filterNavigation(tree, (topics) => topics.includes('web'), 'root/jobs/current');

		expect(ids(filtered)).toEqual(['guides:root', 'guides:root/jobs', 'root/jobs/current', 'guides:root/web', 'root/web/http']);
	});
});

describe('API navigation', () => {
	it('derives crate and module hierarchy from symbol paths', () => {
		const symbols: SymbolPageSummary[] = [
			{
				symbol: 'upwell_axum::config::AxumConfig',
				segments: 'upwell_axum/config/AxumConfig',
				title: 'AxumConfig',
				draft: false,
				topics: ['web']
			},
			{
				symbol: 'upwell_axum::ws::WebsocketProtocol',
				segments: 'upwell_axum/ws/WebsocketProtocol',
				title: 'WebsocketProtocol',
				draft: false,
				topics: ['web']
			}
		];
		const tree = buildApiTree(symbols, 'latest');

		expect(ids([tree])).toEqual([
			'api',
			'api:upwell_axum',
			'api:upwell_axum/config',
			'symbols/upwell_axum/config/AxumConfig',
			'api:upwell_axum/ws',
			'symbols/upwell_axum/ws/WebsocketProtocol'
		]);
	});

	it('covers the current authored API corpus without symbol metadata groups', () => {
		const version = latestVersion(docsConfig).releaseVersion;
		const symbols = symbolPagesFor(version).filter((candidate) => !candidate.draft);
		const tree = buildApiTree(symbols, 'latest');

		expect(ids([tree]).filter((id) => id.startsWith('symbols/'))).toHaveLength(symbols.length);
		expect(ids([tree])).toContain('api:upwell_axum/config');
	});
});
