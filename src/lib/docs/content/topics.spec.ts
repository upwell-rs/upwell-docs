import { describe, expect, it } from 'vitest';

import { topicForCrate } from './topics.ts';

describe('topicForCrate', () => {
	it('matches Cargo package names from artifacts', () => {
		expect(topicForCrate('upwell')?.id).toBe('framework');
		expect(topicForCrate('upwell-app')?.id).toBe('framework');
		expect(topicForCrate('upwell-macros')?.id).toBe('framework');
		expect(topicForCrate('upwell-core')?.id).toBe('framework');
		expect(topicForCrate('upwell-axum')?.id).toBe('web');
		expect(topicForCrate('upwell-axum-macros')?.id).toBe('web');
		expect(topicForCrate('upwell-rpc-macros')?.id).toBe('rpc');
		expect(topicForCrate('upwell-jobs-macros')?.id).toBe('jobs');
	});

	it('does not treat a Rust import path as a Cargo package name', () => {
		expect(topicForCrate('upwell_macros')).toBeUndefined();
	});
});
