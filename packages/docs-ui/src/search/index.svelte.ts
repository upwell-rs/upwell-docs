import { search, type SearchRecord, type SearchResult } from './rank.ts';

interface IndexPayload {
	readonly version: string;
	readonly records: readonly SearchRecord[];
	readonly degraded: boolean;
}

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'failed';

export class SearchIndex {
	#status = $state<SearchStatus>('idle');
	#records: readonly SearchRecord[] = [];
	#degraded = $state(false);
	#loading: Promise<void> | undefined;
	#versionId: string | undefined;

	get status(): SearchStatus {
		return this.#status;
	}

	get degraded(): boolean {
		return this.#degraded;
	}

	async load(versionId: string, href: string): Promise<void> {
		if (this.#versionId === versionId && this.#status === 'ready') {
			return;
		}

		if (this.#versionId === versionId && this.#loading) {
			return this.#loading;
		}

		this.#versionId = versionId;
		this.#status = 'loading';
		this.#loading = this.#fetch(versionId, href);

		return this.#loading;
	}

	async #fetch(versionId: string, href: string): Promise<void> {
		try {
			const response = await fetch(href);

			if (!response.ok) {
				throw new Error(`search index responded ${response.status}`);
			}

			const payload = (await response.json()) as IndexPayload;

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

	query(text: string, limit?: number): SearchResult[] {
		return this.#status === 'ready' ? search(this.#records, text, limit) : [];
	}
}
