import { describe, expect, it } from 'vitest';

import { createDocsContent } from './content.ts';

describe('DocsContent route URLs', () => {
	const content = createDocsContent({
		config: { topics: [] } as never,
		manifest: { guides: [], symbols: [] },
		guideModules: {},
		symbolModules: {},
		basePath: '/reference/docs'
	});

	it('respects the configured base path for every authored reference route', () => {
		expect(content.pageHref('root-v1', 'getting-started')).toBe('/reference/docs/root-v1/getting-started');
		expect(content.symbolHref('framework-extra', 'extra-v2', 'extra/Client')).toBe('/reference/docs/framework-extra/extra-v2/symbols/extra/Client');
		expect(content.sourceHref('framework-extra', 'extra-v2', 'src/lib.rs')).toBe('/reference/docs/framework-extra/extra-v2/src/src/lib.rs');
	});

	it('encodes source file segments without changing directory separators', () => {
		expect(content.sourceHref('framework', 'root-v1', 'crates/app/src/odd#name?.rs')).toBe('/reference/docs/framework/root-v1/src/crates/app/src/odd%23name%3F.rs');
		expect(content.sourceHref('framework', 'root-v1', 'src/malformed%2 name.rs')).toBe('/reference/docs/framework/root-v1/src/src/malformed%252%20name.rs');
		expect(content.sourceHref('framework', 'root-v1', '')).toBe('/reference/docs/framework/root-v1/src/');
	});
});
