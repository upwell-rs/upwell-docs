/**
 * The subset of rustdoc's JSON output this project reads.
 *
 * rustdoc JSON is an unstable format: `format_version` changes without ceremony and fields move.
 * Typing only the parts that are actually consumed keeps the blast radius of a format bump small,
 * and `SUPPORTED_FORMAT_VERSIONS` makes an unexpected version a clear error rather than a pile of
 * undefined reads.
 *
 * Reference: https://doc.rust-lang.org/nightly/nightly-rustc/rustdoc_json_types/
 */

/** rustdoc JSON format versions this project has been checked against. */
export const SUPPORTED_FORMAT_VERSIONS: readonly number[] = [61];

export type ItemId = number;

export interface RustdocSpan {
  /** Path relative to the workspace root, e.g. `crates/dirs/src/lib.rs`. */
  filename: string;
  /** `[line, column]`, 1-based. */
  begin: [number, number];
  end: [number, number];
}

export interface RustdocDeprecation {
  since: string | null;
  note: string | null;
}

export interface RustdocItem {
  id: ItemId;
  crate_id: number;
  name: string | null;
  span: RustdocSpan | null;
  visibility:
    | "public"
    | "default"
    | "crate"
    | { restricted: { parent: ItemId; path: string } };
  docs: string | null;
  /** Intra-doc link text mapped to the item it resolves to. This is the relation graph. */
  links: Record<string, ItemId>;
  attrs: unknown[];
  deprecation: RustdocDeprecation | null;
  inner: Record<string, unknown>;
}

export interface RustdocPathSummary {
  crate_id: number;
  /** Fully qualified path segments, e.g. `["framework_dirs", "DirectoriesManager"]`. */
  path: string[];
  kind: string;
}

export interface RustdocCrate {
  root: ItemId;
  crate_version: string | null;
  includes_private: boolean;
  index: Record<string, RustdocItem>;
  paths: Record<string, RustdocPathSummary>;
  external_crates: Record<string, { name: string; html_root_url?: string }>;
  format_version: number;
}

/** A rustdoc JSON document that cannot be read by this build. */
export class RustdocFormatError extends Error {
  readonly formatVersion: number;

  constructor(file: string, formatVersion: number) {
    super(
      `${file} uses rustdoc JSON format version ${formatVersion}, but this build understands ${SUPPORTED_FORMAT_VERSIONS.join(", ")}.\n\n` +
        "rustdoc JSON is unstable and changes with the nightly toolchain. Either pin the nightly used to generate artifacts, or update @upwell/docs-tools/rustdoc for the new format.",
    );

    this.name = "RustdocFormatError";
    this.formatVersion = formatVersion;
  }
}

export function assertSupportedFormat(file: string, crate: RustdocCrate): void {
  if (!SUPPORTED_FORMAT_VERSIONS.includes(crate.format_version)) {
    throw new RustdocFormatError(file, crate.format_version);
  }
}

/** True when an item is part of the crate's public surface. */
export function isPublic(item: RustdocItem): boolean {
  return item.visibility === "public" || item.visibility === "default";
}

/** The single key of an item's `inner` object, which is what identifies its kind. */
export function innerKind(item: RustdocItem): string | undefined {
  return Object.keys(item.inner ?? {})[0];
}
