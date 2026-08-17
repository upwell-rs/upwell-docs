import type {
	DocSummary,
	NavigationGroup,
	NavigationNode,
	NavigationPage
} from './content.ts';

export interface SymbolNavigationRecord {
	readonly path: string;
	readonly name: string;
	readonly href: string;
	readonly kind: string;
	readonly topics?: readonly string[];
}

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

/** Derives a crate and module tree from the symbols that have navigable pages. */
export function buildSymbolTree(symbols: readonly SymbolNavigationRecord[]): readonly NavigationGroup[] {
	const roots: NavigationGroup[] = [];
	const groups = new Map<string, NavigationGroup>();
	const destinations = new Set<string>();

	const ordered = symbols.toSorted((a, b) => Number(b.kind === 'module') - Number(a.kind === 'module'));

	for (const symbol of ordered) {
		if (destinations.has(symbol.href)) {
			continue;
		}

		destinations.add(symbol.href);

		const hrefSegments = symbol.href.split('/symbols/')[1];
		const segments = hrefSegments?.split('/') ?? symbol.path.split('::');
		let parent: NavigationGroup | undefined;

		const groupDepth = symbol.kind === 'module' ? segments.length : segments.length - 1;

		for (let depth = 0; depth < groupDepth; depth += 1) {
			const path = segments.slice(0, depth + 1).join('/');
			const id = `symbols:${path}`;
			let group = groups.get(id);

			if (!group) {
				group = {
					type: 'group',
					id,
					label: depth === 0 ? segments[depth].replaceAll('_', '-') : segments[depth],
					...(symbol.kind === 'module' && depth === segments.length - 1
						? { href: symbol.href, pageId: `symbols/${segments.join('/')}` }
						: {}),
					order: 0,
					defaultOpen: depth === 0,
					kind: 'reference',
					children: []
				};
				groups.set(id, group);
				(parent ? (parent.children as NavigationNode[]) : roots).push(group);
			}

			parent = group;
		}

		if (symbol.kind === 'module') {
			continue;
		}

		if (!parent) {
			continue;
		}

		(parent.children as NavigationNode[]).push({
			type: 'page',
			id: `symbols/${segments.join('/')}`,
			title: segments.at(-1) ?? symbol.name,
			href: symbol.href,
			order: 0,
			topics: symbol.topics ?? [],
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

	for (const root of roots) {
		sort(root);
	}

	return roots.sort(compareNodes);
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

		const holdsCurrent = node.pageId === current || node.children.some(visit);

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
