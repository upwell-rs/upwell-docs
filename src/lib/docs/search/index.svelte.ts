/**
 * Loading and querying the search index in the browser.
 *
 * The index is fetched once, on first use, from the prerendered JSON for the release being read —
 * so a reader who never searches never downloads it, and a reader who does pays once.
 *
 * Querying is synchronous after that. The corpus is small enough to score exhaustively, and a
 * search box that answers between keystrokes is worth far more here than one that is asymptotically
 * cleverer.
 */

import { search, type SearchRecord, type SearchResult } from './rank.ts';

interface IndexPayload {
	readonly version: string;
	readonly records: readonly SearchRecord[];
	/** True when the release had no artifact, so symbols are missing from the index. */
	readonly degraded: boolean;
}

/** What the search UI needs to know while it is working. */
export type SearchStatus = 'idle' | 'loading' | 'ready' | 'failed';

class SearchIndex {
	#status = $state<SearchStatus>('idle');
	#records: readonly SearchRecord[] = [];
	#degraded = $state(false);
	#loading: Promise<void> | undefined;
	#versionId: string | undefined;

	get status(): SearchStatus {
		return this.#status;
	}

	/** True when the release has no artifact, so the index covers pages but not symbols. */
	get degraded(): boolean {
		return this.#degraded;
	}

	/**
	 * Fetches the index for a release, at most once.
	 *
	 * Switching release discards the previous index rather than merging: results must belong to the
	 * documentation being read, and a result from another release would navigate away from it.
	 */
	async load(versionId: string): Promise<void> {
		if (this.#versionId === versionId && this.#status === 'ready') {
			return;
		}

		if (this.#versionId === versionId && this.#loading) {
			return this.#loading;
		}

		this.#versionId = versionId;
		this.#status = 'loading';
		this.#loading = this.#fetch(versionId);

		return this.#loading;
	}

	async #fetch(versionId: string): Promise<void> {
		try {
			const response = await fetch(`/docs/${versionId}/search.json`);

			if (!response.ok) {
				throw new Error(`search index responded ${response.status}`);
			}

			const payload = (await response.json()) as IndexPayload;

			// A late response for a release the reader has since left must not replace the current one.
			if (this.#versionId !== versionId) {
				return;
			}

			this.#records = payload.records;
			this.#degraded = payload.degraded;
			this.#status = 'ready';
		} catch {
			if (this.#versionId === versionId) {
				this.#status = 'failed';
			}
		} finally {
			this.#loading = undefined;
		}
	}

	/** Results for a query, or nothing while the index is still on its way. */
	query(text: string, limit?: number): SearchResult[] {
		if (this.#status !== 'ready') {
			return [];
		}

		return search(this.#records, text, limit);
	}
}

export const searchIndex = new SearchIndex();
