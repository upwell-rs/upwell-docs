import type {
	DocSummary,
	NavigationGroup,
	NavigationNode,
	NavigationPage,
	SymbolPageSummary
} from './content.ts';

function compareNodes(a: NavigationNode, b: NavigationNode): number {
	return a.order - b.order || a.type.localeCompare(b.type) || ('label' in a ? a.label : a.title).localeCompare('label' in b ? b.label : b.title);
}

/** Derives guide groups from visible directories without introducing a synthetic root. */
export function buildGuideTree(
	pages: readonly DocSummary[],
	pageHref: (slug: string) => string
): readonly NavigationGroup[] {
	const roots: NavigationGroup[] = [];
	const groups = new Map<string, NavigationGroup>();

	for (const page of pages) {
		const segments = page.slug.split('/');
		let parent: NavigationGroup | undefined;

		for (let depth = 0; depth < segments.length - 1; depth += 1) {
			const path = segments.slice(0, depth + 1).join('/');
			let group = groups.get(path);

			if (!group) {
				group = {
					type: 'group',
					id: `guides:${path}`,
					label: segments[depth],
					order: 0,
					defaultOpen: true,
					kind: 'guide',
					children: []
				};
				groups.set(path, group);
				(parent ? (parent.children as NavigationNode[]) : roots).push(group);
			}

			parent = group;
		}

		(parent ? (parent.children as NavigationNode[]) : roots).push({
			type: 'page',
			id: page.slug,
			title: page.title,
			href: pageHref(page.slug),
			order: page.order,
			topics: page.topics,
			reference: false
		});
	}

	const sort = (node: NavigationGroup): NavigationGroup => {
		const children = node.children ?? [];

		return {
			...node,
			children: children.map((child) => (child.type === 'group' ? sort(child) : child)).toSorted(compareNodes)
		};
	};

	return roots.map(sort).toSorted(compareNodes);
}

/** Derives API crate and module groups solely from authored symbol paths. */
export function buildApiTree(
	symbols: readonly SymbolPageSummary[],
	symbolHref: (segments: string) => string
): NavigationGroup {
	const root: NavigationGroup = {
		type: 'group',
		id: 'api',
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
			const id = `api:${path}`;
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
			href: symbolHref(page.segments),
			order: 0,
			topics: page.topics,
			reference: true
		});
	}

	const sort = (group: NavigationGroup): void => {
		for (const child of group.children) {
			if (child.type === 'group') {
				sort(child);
			}
		}

		(group.children as NavigationNode[]).sort(compareNodes);
	};

	sort(root);

	return root;
}

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
		if (node.type === 'page') {
			return node.id === current;
		}

		const holdsCurrent = node.children.some(visit);

		if (holdsCurrent) {
			active.add(node.id);
		}

		return holdsCurrent;
	};

	nodes.some(visit);

	return active;
}

export function navigationLeaves(nodes: readonly NavigationNode[]): readonly NavigationPage[] {
	return nodes.flatMap((node) => (node.type === 'page' ? [node] : navigationLeaves(node.children)));
}

export function navigationTopics(nodes: readonly NavigationNode[]): readonly string[] {
	return nodes.flatMap((node) => (node.type === 'page' ? node.topics : navigationTopics(node.children)));
}
