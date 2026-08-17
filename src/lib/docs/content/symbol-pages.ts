/**
 * Loads hand-written symbol pages.
 *
 * A symbol page is where a framework symbol gets documentation of its own — prose that rustdoc
 * cannot express, worked examples, links to the guides that use it. They are written deliberately,
 * one at a time; there is no page per symbol and there is not meant to be.
 *
 * **The file's location is the symbol it documents.** `framework/prelude/component.svx` documents
 * `framework::prelude::component`. That is not decoration: it lets the build discover which symbols
 * have pages by listing a directory, with no frontmatter to read and nothing to keep in sync, and
 * it makes the URL and the file mirror each other.
 *
 * A page beneath a version selector directory replaces or bounds the shared path for matching releases.
 *
 * The rustdoc-derived facts about the symbol are handed to the page at render time, so a page can
 * show the real signature or feature requirement without copying it into prose where it would rot.
 *
 * Metadata comes from the build-time manifest and markup from a lazy glob, for the same reason
 * guides do: the sidebar lists every symbol page, but only one page's markup is ever needed at once.
 */

import type { Component } from 'svelte';

import { manifest } from 'virtual:docs-manifest';

import { appliesTo, type CompiledRange, compileRange } from './applies.ts';
import type { SemVer } from '../version/semver.ts';
import { groupByPath, normalizeVersionPath, rejectRedundantSince, resolveCandidate, type PathCandidate } from './overlay.ts';
import { assertKnownTopics } from './topics.ts';
import type { SymbolFrontmatter, SymbolPageSummary } from './types.ts';

const symbolModules = import.meta.glob<{ default: Component }>('/src/content/symbols/**/*.svx');

interface SymbolPageVariant {
	readonly summary: SymbolPageSummary;
	readonly range: CompiledRange;
	/** Project-rooted path, which is the key into the component glob. */
	readonly file: string;
}

function toVariant(file: string, segments: string, frontmatter: Partial<SymbolFrontmatter>): SymbolPageVariant {
	const symbol = segments.split('/').join('::');

	const topics = frontmatter.topics ?? [];

	assertKnownTopics(topics, `Symbol page ${file}`);

	return {
		summary: {
			symbol,
			segments,
			title: frontmatter.title ?? (symbol.split('::').pop() ?? symbol),
			description: frontmatter.description,
			draft: frontmatter.draft ?? false,
			topics
		},
		range: compileRange(frontmatter, `Symbol page ${file}`),
		file
	};
}

const variantsBySegments: Map<string, PathCandidate<SymbolPageVariant>[]> = buildVariants();

function buildVariants(): Map<string, PathCandidate<SymbolPageVariant>[]> {
	return groupByPath(manifest.symbols.map((entry) => {
		const normalized = normalizeVersionPath(entry.relativePath, 'Symbol page');
		const frontmatter = entry.frontmatter as Partial<SymbolFrontmatter>;

		rejectRedundantSince(normalized.selector, frontmatter.since, `Symbol page ${entry.file}`);

		return {
			relativePath: entry.relativePath,
			value: toVariant(entry.file, normalized.path, frontmatter)
		};
	}), 'Symbol page');
}

function variantFor(segments: string, releaseVersion: SemVer): SymbolPageVariant | undefined {
	const variants = variantsBySegments.get(segments);
	const resolved = variants ? resolveCandidate(variants, releaseVersion) : undefined;

	return resolved && appliesTo(resolved.range, releaseVersion) ? resolved : undefined;
}

/** Every symbol page path the site has, across all versions. */
export const symbolPageSegments: readonly string[] = [...variantsBySegments.keys()].sort();

/** Symbol pages that apply to one framework version. */
export function symbolPagesFor(releaseVersion: SemVer): readonly SymbolPageSummary[] {
	const resolved: SymbolPageSummary[] = [];

	for (const segments of variantsBySegments.keys()) {
		const variant = variantFor(segments, releaseVersion);

		if (variant) {
			resolved.push(variant.summary);
		}
	}

	return resolved.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** The symbol page addressed by URL segments, if it applies to the version. */
export function findSymbolPage(segments: string, releaseVersion: SemVer): SymbolPageSummary | undefined {
	return variantFor(segments, releaseVersion)?.summary;
}

/** Exact source file selected for a symbol page and release, used by search and validation. */
export function symbolPageSource(segments: string, releaseVersion: SemVer): string | undefined {
	return variantFor(segments, releaseVersion)?.file;
}

/**
 * A symbol page's compiled component for a version, which may come from an overlay.
 *
 * Asynchronous because the component is a separate chunk — see `pages.ts` for why that matters.
 */
export async function loadSymbolPage(segments: string, releaseVersion: SemVer): Promise<Component | undefined> {
	const variant = variantFor(segments, releaseVersion);
	const load = variant ? symbolModules[variant.file] : undefined;

	return load ? (await load()).default : undefined;
}
