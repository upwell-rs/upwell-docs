import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import { documentKey, effectiveDocument } from './search-index.ts';

describe('search document selection', () => {
	it('keys the exact effective overlay source', () => {
		expect(documentKey('/src/content/docs/1.0.0/getting-started.svx')).toBe(
			path.join(process.cwd(), 'src/content/docs/1.0.0/getting-started.svx')
		);
	});

	it('selects the effective variant regardless of compile order', () => {
		const trunk = { file: path.join(process.cwd(), 'src/content/docs/getting-started.svx'), text: 'trunk' };
		const release = { file: path.join(process.cwd(), 'src/content/docs/1.0.0/getting-started.svx'), text: 'release' };

		expect(effectiveDocument([release, trunk], '/src/content/docs/1.0.0/getting-started.svx')?.text).toBe('release');
		expect(effectiveDocument([trunk, release], '/src/content/docs/1.0.0/getting-started.svx')?.text).toBe('release');
	});
});
