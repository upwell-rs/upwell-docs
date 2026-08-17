/**
 * The document index: headings and prose, captured while pages compile.
 *
 * Search needs the text of pages other than the one being read, which the browser cannot see and
 * the DOM cannot supply. It has to come from the build.
 *
 * It is captured during the rehype pass rather than by re-reading the `.svx` files, because that
 * pass is already handed the parsed document. Nothing here parses markdown or HTML — it walks a
 * tree mdsvex produced.
 *
 * **The index is persisted to disk, and that is not incidental.** The rehype plugin runs inside the
 * Vite build; prerendering — which is what reads the index — runs in a *separate process*. Neither
 * a module-level map nor a `globalThis` key survives that boundary, and both fail silently, leaving
 * every search record stripped of its text. A file is the only thing the two share.
 *
 * One file per page rather than one file rewritten per page, so recording is O(1) in the number of
 * pages rather than O(n). A file left behind by a deleted page is harmless: the reader matches
 * documents against the pages that exist, so an orphan matches nothing.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/** One page, as search sees it. */
export interface IndexedDocument {
  /** Absolute path of the source file, which the caller maps to a slug. */
  readonly file: string;
  readonly headings: readonly IndexedHeading[];
  /** Prose with markup removed and whitespace collapsed. */
  readonly text: string;
}

export interface IndexedHeading {
  readonly id: string;
  readonly text: string;
  readonly depth: 2 | 3;
}

/** Where captured documents live. Inside `.svelte-kit`, so it is build output and already ignored. */
function storeDir(): string {
  return path.join(process.cwd(), ".svelte-kit", "framework-docs", "documents");
}

const documents = new Map<string, IndexedDocument>();

/** Whether this process has read what the build left behind. */
let hydrated = false;

/** A file name that survives a round trip, so one page always maps to one file. */
function fileNameFor(source: string): string {
  return `${Buffer.from(source).toString("base64url")}.json`;
}

/** Records a page. Called once per compile; a recompile replaces the entry. */
export function recordDocument(document: IndexedDocument): void {
  documents.set(document.file, document);

  try {
    const directory = storeDir();

    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, fileNameFor(document.file)),
      JSON.stringify(document),
      "utf8",
    );
  } catch {
    // Persisting is what lets prerendering see this, but failing to is not worth breaking a build
    // over: search degrades to titles and paths, which the index still carries.
  }
}

/**
 * Every page the build captured.
 *
 * Reads from disk once per process, because the process that wrote them is not this one.
 */
export function indexedDocuments(): readonly IndexedDocument[] {
  if (!hydrated) {
    hydrate();
  }

  return [...documents.values()].sort((a, b) => a.file.localeCompare(b.file));
}

function hydrate(): void {
  hydrated = true;

  let entries: string[];

  try {
    entries = readdirSync(storeDir());
  } catch {
    // Nothing has been captured yet — a first build, or a dev server that has compiled no pages.
    return;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }

    try {
      const document = JSON.parse(
        readFileSync(path.join(storeDir(), entry), "utf8"),
      ) as IndexedDocument;

      // In-memory records are from this process and are never older than the file.
      if (!documents.has(document.file)) {
        documents.set(document.file, document);
      }
    } catch {
      // A truncated or stale file loses one page from search rather than the whole index.
    }
  }
}

/** Clears the store and takes ownership of it, so a test is never joined by the build's leftovers. */
export function resetDocumentIndex(): void {
  documents.clear();
  hydrated = true;
}

/**
 * Longest prose captured per page.
 *
 * Search matches on the opening of a page far more often than deep inside it, and an uncapped index
 * grows without bound as the guides do. This is a search index, not an archive.
 */
export const MAX_TEXT = 8000;

/** Collapses captured text fragments into the single string the index stores. */
export function collapse(fragments: readonly string[]): string {
  const text = fragments.join(" ").replace(/\s+/g, " ").trim();

  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
}
