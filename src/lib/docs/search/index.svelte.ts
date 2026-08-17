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

import { SearchIndex } from '@upwell/docs-ui/search';

/** What the search UI needs to know while it is working. */
export type SearchStatus = 'idle' | 'loading' | 'ready' | 'failed';

class AppSearchIndex extends SearchIndex {
	load(versionId: string): Promise<void> {
		return super.load(versionId, `/docs/${versionId}/search.json`);
	}
}

export const searchIndex = new AppSearchIndex();
