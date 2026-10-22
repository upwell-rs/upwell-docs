import { describe, expect, it } from 'vitest';

import { latestVersion } from '@upwell/docs-core/config';
import { docsContent } from './runtime.ts';
import { docsServerRoutes } from './runtime.server.ts';
import { llms, symbolInventoryPath } from './discovery.server.ts';

describe('llms.txt machine-readable links', () => {
	it('advertises a symbols.json inventory that the application serves', () => {
		const latest = latestVersion(docsContent.config);
		const advertised = symbolInventoryPath(latest.id);
		const served = docsServerRoutes.symbolIndexEntries().map((entry) => `/docs/${entry.source}/${entry.version}/symbols.json`);

		expect(llms()).toContain(advertised);
		expect(served).toContain(advertised);
	});

	it('only advertises symbols.json paths in the source-scoped route shape', () => {
		const advertised = llms().match(/\/docs\/\S*symbols\.json/g) ?? [];

		expect(advertised.length).toBeGreaterThan(0);
		for (const path of advertised) {
			expect(path).toMatch(/^\/docs\/[^/]+\/[^/]+\/symbols\.json$/);
		}
	});
});
