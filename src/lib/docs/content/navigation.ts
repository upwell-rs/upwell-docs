import type { DocsVersion } from '../config.ts';
import { pagesFor } from './pages.ts';
import { symbolPagesFor } from './symbol-pages.ts';
import { buildGuideTree } from './navigation-tree.ts';
import type { NavigationGroup, NavigationNode, SymbolPageSummary } from './types.ts';

const API_ROOT_ID = 'api';

function compareNodes(a: NavigationNode, b: NavigationNode): number {
	return a.order - b.order || a.type.localeCompare(b.type) || ('label' in a ? a.label : a.title).localeCompare('label' in b ? b.label : b.title);
}

/** Derives API -> crate -> module-directory groups solely from authored symbol paths. */
export function buildApiTree(symbols: readonly SymbolPageSummary[], versionId: string): NavigationGroup {
	const root: NavigationGroup = {
		type: 'group',
		id: API_ROOT_ID,
		label: 'API reference',
		order: 1000,
		defaultOpen: false,
		kind: 'reference',
		children: []
	};
	const groups = new Map<string, NavigationGroup>([[root.id, root]]);

	for (const page of symbols.filter((candidate) => !candidate.draft)) {
		const segments = page.segments.split('/');
		let parent = root;

		for (let depth = 0; depth < segments.length - 1; depth += 1) {
			const path = segments.slice(0, depth + 1).join('/');
			const id = `${API_ROOT_ID}:${path}`;
			let group = groups.get(id);

			if (!group) {
				group = {
					type: 'group',
					id,
					label: depth === 0 ? segments[depth].replaceAll('_', '-') : segments[depth],
					order: 0,
					defaultOpen: false,
					kind: 'reference',
					children: []
				};
				groups.set(id, group);
				(parent.children as NavigationNode[]).push(group);
			}

			parent = group;
		}

		(parent.children as NavigationNode[]).push({
			type: 'page',
			id: `symbols/${page.segments}`,
			title: page.title,
			href: `/docs/${versionId}/symbols/${page.segments}`,
			order: 0,
			topics: page.topics,
			reference: true
		});
	}

	const sort = (group: NavigationGroup): void => {
		for (const child of group.children) {
			if (child.type === 'group') sort(child);
		}

		(group.children as NavigationNode[]).sort(compareNodes);
	};

	sort(root);

	return root;
}

export function navigationFor(version: DocsVersion): readonly NavigationGroup[] {
	const guides = buildGuideTree(pagesFor(version.releaseVersion).filter((page) => !page.draft), version.id);
	const api = buildApiTree(symbolPagesFor(version.releaseVersion), version.id);

	return api.children.length > 0 ? [...guides, api] : guides;
}

/** Keeps matching leaves, the current leaf, and every ancestor needed to orient either. */
export function filterNavigation(
	nodes: readonly NavigationNode[],
	admits: (topics: readonly string[]) => boolean,
	current: string
): readonly NavigationNode[] {
	return nodes.flatMap((node): NavigationNode[] => {
		if (node.type === 'page') {
			return admits(node.topics) || node.id === current ? [node] : [];
		}

		const children = filterNavigation(node.children, admits, current);

		return children.length > 0 ? [{ ...node, children }] : [];
	});
}

export function activeGroupIds(nodes: readonly NavigationNode[], current: string): ReadonlySet<string> {
	const active = new Set<string>();

	const visit = (node: NavigationNode): boolean => {
		if (node.type === 'page') return node.id === current;

		const holdsCurrent = node.children.some(visit);

		if (holdsCurrent) active.add(node.id);

		return holdsCurrent;
	};

	nodes.some(visit);

	return active;
}

export function navigationTopics(nodes: readonly NavigationNode[]): readonly string[] {
	return nodes.flatMap((node) => (node.type === 'page' ? node.topics : navigationTopics(node.children)));
}
