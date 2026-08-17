import type { DocSummary, NavigationGroup, NavigationNode, NavigationPage } from './types.ts';

function compareNodes(a: NavigationNode, b: NavigationNode): number {
	return a.order - b.order || a.type.localeCompare(b.type) || ('label' in a ? a.label : a.title).localeCompare('label' in b ? b.label : b.title);
}

/** Derives guide groups from visible directories. There is intentionally no synthetic root group. */
export function buildGuideTree(pages: readonly DocSummary[], versionId: string): readonly NavigationGroup[] {
	const roots: NavigationGroup[] = [];
	const groups = new Map<string, NavigationGroup>();

	for (const page of pages) {
		const segments = page.slug.split('/');
		let parent: NavigationGroup | undefined;

		for (let depth = 0; depth < segments.length - 1; depth += 1) {
			const path = segments.slice(0, depth + 1).join('/');
			let group = groups.get(path);

			if (!group) {
				group = { type: 'group', id: `guides:${path}`, label: segments[depth], order: 0, defaultOpen: true, kind: 'guide', children: [] };
				groups.set(path, group);
				(parent ? (parent.children as NavigationNode[]) : roots).push(group);
			}

			parent = group;
		}

		(parent ? (parent.children as NavigationNode[]) : roots).push({
			type: 'page',
			id: page.slug,
			title: page.title,
			href: `/docs/${versionId}/${page.slug}`,
			order: page.order,
			topics: page.topics,
			reference: false
		});
	}

	const sort = (node: NavigationGroup): NavigationGroup => {
		const children = node.children ?? [];

		return { ...node, children: children.map((child) => (child.type === 'group' ? sort(child) : child)).toSorted(compareNodes) };
	};

	return roots.map(sort).toSorted(compareNodes);
}

/** Page leaves in the same depth-first sequence the recursive navigation renders. */
export function navigationLeaves(nodes: readonly NavigationNode[]): readonly NavigationPage[] {
	return nodes.flatMap((node) => (node.type === 'page' ? [node] : navigationLeaves(node.children)));
}
