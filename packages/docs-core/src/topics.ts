import type { DocsTopic } from './config.ts';

export class UnknownTopicError extends Error {
	constructor(message: string) {
		super(message);

		this.name = 'UnknownTopicError';
	}
}

export interface TopicRegistry {
	readonly topics: readonly DocsTopic[];
	find(id: string): DocsTopic | undefined;
	forCrate(crate: string): DocsTopic | undefined;
	assertKnown(ids: readonly string[], describe: string): void;
	present(used: readonly string[]): readonly DocsTopic[];
}

/** Validates declared topics and exposes stable lookup indexes for a content catalog. */
export function createTopicRegistry(topics: readonly DocsTopic[]): TopicRegistry {
	const byId = new Map(topics.map((topic) => [topic.id, topic]));
	const byCrate = new Map<string, DocsTopic>();

	for (const topic of topics) {
		for (const crate of topic.crates) {
			if (!byCrate.has(crate)) {
				byCrate.set(crate, topic);
			}
		}
	}

	return {
		topics,
		find: (id) => byId.get(id),
		forCrate: (crate) => byCrate.get(crate),
		assertKnown(ids, describe) {
			const unknown = ids.filter((id) => !byId.has(id));

			if (unknown.length > 0) {
				throw new UnknownTopicError(
					`${describe} declares unknown topic${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.\n\nTopics available: ${topics.map((topic) => topic.id).join(', ')}.`
				);
			}
		},
		present: (used) => topics.filter((topic) => used.includes(topic.id))
	};
}
