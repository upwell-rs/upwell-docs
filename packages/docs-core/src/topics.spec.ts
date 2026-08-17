import { describe, expect, it } from 'vitest';

import { createTopicRegistry } from './topics.ts';

const registry = createTopicRegistry([
	{ id: 'framework', label: 'Framework', description: 'Core APIs', crates: ['upwell', 'upwell-core'] },
	{ id: 'web', label: 'Web', description: 'HTTP APIs', crates: ['upwell-axum'] }
]);

describe('topic registry', () => {
	it('matches Cargo package names', () => {
		expect(registry.forCrate('upwell-core')?.id).toBe('framework');
		expect(registry.forCrate('upwell-axum')?.id).toBe('web');
		expect(registry.forCrate('upwell_axum')).toBeUndefined();
	});

	it('rejects unknown authored topics', () => {
		expect(() => registry.assertKnown(['missing'], 'Page /guides/example.svx')).toThrow(/unknown topic/);
	});
});
