import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONFIG_MODULE, docsConfig } from './config.ts';

describe('documentation config virtual module', () => {
	it('resolves the virtual import to Vite app root config value', () => {
		const plugin = docsConfig();
		const resolveId = plugin.resolveId;
		const load = plugin.load;
		const configResolved = plugin.configResolved;

		if (typeof resolveId !== 'function' || typeof load !== 'function' || typeof configResolved !== 'function') {
			throw new Error('The config plugin must provide function hooks.');
		}

		configResolved.call({} as never, { root: '/app-root' } as never);

		const resolved = resolveId.call({} as never, CONFIG_MODULE, undefined, { isEntry: false });

		expect(resolved).toBe(`\0${CONFIG_MODULE}`);
		expect(load.call({} as never, `\0${CONFIG_MODULE}`)).toBe(
			`export { docsConfig } from ${JSON.stringify(path.join('/app-root', 'docs.config.ts'))};\n`
		);
	});
});
