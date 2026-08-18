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

/** A guide group while its entrypoint and order are still unknown. */
interface GuideGroupDraft {
	readonly path: string;
	readonly children: GuideNodeDraft[];
	entry?: DocSummary;
}

type GuideNodeDraft = GuideGroupDraft | DocSummary;

function isGroupDraft(node: GuideNodeDraft): node is GuideGroupDraft {
	return 'children' in node;
}

function compareNodes(a: NavigationNode, b: NavigationNode): number {
	return a.order - b.order || a.type.localeCompare(b.type) || ('label' in a ? a.label : a.title).localeCompare('label' in b ? b.label : b.title);
}

/**
 * Derives guide groups from visible directories without introducing a synthetic root.
 *
 * A directory's `index.svx` is its entrypoint: the manifest strips the `/index` segment, so that
 * page's slug is the directory path itself. Rather than becoming a leaf beside its own siblings, it
 * becomes the group — supplying the group's label, link, and order. A group without an entrypoint
 * takes the order of its earliest child, which keeps groups and pages interleaved by one comparable
 * number instead of pinning every group above every page.
 */
export function buildGuideTree(
	pages: readonly DocSummary[],
	pageHref: (slug: string) => string
): readonly NavigationNode[] {
	const roots: GuideNodeDraft[] = [];
	const groups = new Map<string, GuideGroupDraft>();

	for (const page of pages) {
		const segments = page.slug.split('/');
		let parent: GuideGroupDraft | undefined;

		for (let depth = 0; depth < segments.length - 1; depth += 1) {
			const path = segments.slice(0, depth + 1).join('/');
			let group = groups.get(path);

			if (!group) {
				group = { path, children: [] };
				groups.set(path, group);
				(parent ? parent.children : roots).push(group);
			}

			parent = group;
		}
	}

	for (const page of pages) {
		const group = groups.get(page.slug);

		if (group) {
			group.entry = page;

			continue;
		}

		const parentPath = page.slug.split('/').slice(0, -1).join('/');
		const parent = parentPath ? groups.get(parentPath) : undefined;

		(parent ? parent.children : roots).push(page);
	}

	const toPage = (page: DocSummary): NavigationPage => ({
		type: 'page',
		id: page.slug,
		title: page.title,
		href: pageHref(page.slug),
		order: page.order,
		topics: page.topics,
		reference: false
	});

	const toGroup = (draft: GuideGroupDraft): NavigationGroup => {
		const children = draft.children.map((child) => (isGroupDraft(child) ? toGroup(child) : toPage(child))).toSorted(compareNodes);
		const entry = draft.entry;
		const inherited = children.length > 0 ? Math.min(...children.map((child) => child.order)) : 0;

		return {
			type: 'group',
			id: `guides:${draft.path}`,
			label: entry?.title ?? draft.path.split('/').at(-1) ?? draft.path,
			...(entry ? { href: pageHref(entry.slug), pageId: entry.slug, topics: entry.topics } : {}),
			order: entry?.order ?? inherited,
			defaultOpen: true,
			kind: 'guide',
			children
		};
	};

	return roots.map((node) => (isGroupDraft(node) ? toGroup(node) : toPage(node))).toSorted(compareNodes);
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

		if (children.length > 0) {
			return [{ ...node, children }];
		}

		// A group that is itself a page survives on its own topics, the way a leaf does.
		return node.pageId && (admits(node.topics ?? []) || node.pageId === current) ? [{ ...node, children }] : [];
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

/** Lists pages in rendered reading order, counting a group's own entrypoint page before its children. */
export function navigationLeaves(nodes: readonly NavigationNode[]): readonly NavigationPage[] {
	return nodes.flatMap((node): readonly NavigationPage[] => {
		if (node.type === 'page') {
			return [node];
		}

		const entry: readonly NavigationPage[] =
			node.pageId && node.href
				? [
						{
							type: 'page',
							id: node.pageId,
							title: node.label,
							href: node.href,
							order: node.order,
							topics: node.topics ?? [],
							reference: node.kind === 'reference'
						}
					]
				: [];

		return [...entry, ...navigationLeaves(node.children)];
	});
}

/**
 * Collects every topic the tree can be filtered by, a group's own entrypoint included.
 *
 * A group that stands for a page carries that page's topics, and the filter list is built from this:
 * without them, a topic used only by an `index.svx` would never be offered even though filtering on
 * it would keep that group.
 */
export function navigationTopics(nodes: readonly NavigationNode[]): readonly string[] {
	return nodes.flatMap((node) =>
		node.type === 'page' ? node.topics : [...(node.topics ?? []), ...navigationTopics(node.children)]
	);
}
