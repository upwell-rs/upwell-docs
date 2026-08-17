/**
 * Topics: the subject a page belongs to, and what the sidebar filters on.
 *
 * A reader working on an HTTP service does not want the job scheduler in their way. Sections
 * already group pages by *kind* ("Core concepts", "Guides"); topics cut across that by *subject*,
 * which is the axis a reader filters on.
 *
 * Topics are **declared**, not free text. A typo in a free-form tag produces a topic of one page
 * that nobody ever filters to, and no error — so the set lives here, and an unknown topic on a page
 * fails the build.
 *
 * Each topic may claim framework crates. That is what lets a **symbol page classify itself**: the
 * symbol's crate decides its topic, so reference material is filtered alongside the guides that
 * describe it without anyone maintaining a second list.
 */

import { type DocsTopic } from '../config.ts';
import { docsConfig } from 'virtual:docs-config';

export type Topic = DocsTopic;

/**
 * The topics this site recognises.
 *
 * Deliberately few. Filters stop helping once there are more of them than a reader will read, and
 * every topic added is one more decision demanded of every page author.
 */
export const topics = docsConfig.topics;

/** A topic that no page can belong to. */
export class UnknownTopicError extends Error {
	constructor(message: string) {
		super(message);

		this.name = 'UnknownTopicError';
	}
}

const byId = new Map(topics.map((topic) => [topic.id, topic]));

/** Looks a topic up by id. */
export function findTopic(id: string): Topic | undefined {
	return byId.get(id);
}

/**
 * Validates the topics a page declares.
 *
 * Unknown ids fail the build, which is the whole reason the set is declared rather than free text.
 */
export function assertKnownTopics(ids: readonly string[], describe: string): void {
	const unknown = ids.filter((id) => !byId.has(id));

	if (unknown.length > 0) {
		throw new UnknownTopicError(
			`${describe} declares unknown topic${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.\n\nTopics available: ${topics.map((topic) => topic.id).join(', ')}.\n\nAdd it to src/lib/docs/content/topics.ts if the subject is genuinely new.`
		);
	}
}

const byCrate = new Map<string, Topic>();

for (const topic of topics) {
	for (const crate of topic.crates) {
		// First claim wins. A crate under two topics would otherwise depend on iteration order, which
		// is a worse failure than the arbitrary-but-stable choice made here.
		if (!byCrate.has(crate)) {
			byCrate.set(crate, topic);
		}
	}
}

/** The topic a framework crate belongs to, if any claims it. */
export function topicForCrate(crate: string): Topic | undefined {
	return byCrate.get(crate);
}

/** Topics used by a set of pages, in declaration order. */
export function presentTopics(used: readonly string[]): readonly Topic[] {
	return topics.filter((topic) => used.includes(topic.id));
}
