# Rust documentation template

A generic, ready-to-use documentation site for a Rust framework. Authors write `.svx` files; the optional `docs:prepare` command builds a Rustdoc-derived artifact that enriches Rust snippets with symbols, signatures, summaries, feature requirements, source links, and search results.

## Start writing

```sh
bun install
bun run dev
```

The site is immediately usable without a Rust framework checkout. One version directory selector gates a content candidate without appearing in URLs, navigation, breadcrumbs, search paths, or Rust symbol paths. `1` matches stable `>=1.0.0, <2.0.0`; `1.4` matches stable `>=1.4.0, <1.5.0`; full selectors such as `1.4.0` and `1.4.0-rc.1` replace a candidate at their lower bound and carry forward. For example, `src/content/docs/1/framework/application-model.svx` serves `/docs/1.0.0/framework/application-model`; the selector may appear at any directory depth. Partial prereleases, build metadata, legacy `@` directories, and paths with multiple selectors are rejected. Shared unversioned files are the baseline. A path-selected candidate must not also declare frontmatter `since`.

Before publishing, update the placeholder values in `src/lib/docs/config.ts`:

- `framework.crate`: the public facade crate, or the crate users import most often
- `framework.name`: the display name shown in the header
- `framework.repository`: the repository URL used by the header and source links
- `framework.releaseTag`: the tag convention for your releases
- `versions`: explicit public releases; `releaseVersion` is the public URL, picker, content-gate, and cache identity
- `symbolEnrichmentVersions`: releases whose artifact provenance matches the current framework identity and may provide symbol facts and links
- `latest`: the explicit release id that the `/docs/latest` redirect alias targets
- `topics`: optional sidebar filters and the framework crates they classify
- `rustdoc.directDependencyCrates`: external crates considered plausible imports in ambiguous snippets; use `workspace` or an explicit list
- `rustdoc.standardLibraryCrates`: first-tier external crates to enrich from `rust-docs-json`

## Optional Rustdoc enrichment

Prepare an artifact from a local checkout when you want framework-aware code examples and API search:

```sh
bun run docs:prepare --local ../framework
```

`docs:prepare --version <release>` runs nightly rustdoc JSON over the workspace and writes the resulting artifact to `.cache/upwell-docs/<release>/`. The manifest records the requested public documentation release and the source package provenance. Releases listed in `docsConfig.readOnlyArtifactVersions` are historical records and the command refuses to replace their cache directories; the bundled `0.20.0` artifact is read-only. Its preserved provenance is not eligible to enrich current Upwell symbols, so 0.20 remains guide-only: authored pages, routes, and search work, while Rust fences are highlighted without symbol facts, links, or API pages. Only releases in `docsConfig.symbolEnrichmentVersions` may provide code-lens data and symbol search records.

Set `FRAMEWORK_CHECKOUT` to avoid repeating `--local`:

```sh
export FRAMEWORK_CHECKOUT=../framework
bun run docs:prepare
```

On later runs, reuse already-generated Rustdoc JSON when the framework checkout has not changed:

```sh
bun run docs:prepare --local ../framework --reuse-rustdoc
```

For richer standard-library hover cards, install the matching nightly component:

```sh
rustup component add rust-docs-json --toolchain nightly
```

## Writing pages

Every guide is an `.svx` file beneath `src/content/docs`. Visible directories derive navigation groups; there is no configured root `Guides` group and no `group:` frontmatter. Put a page under a full SemVer selector directory to introduce or replace it at that release:

````svx
---
title: Middleware
description: Wrap requests with cross-cutting behavior.
order: 20
---

<script>
	import { Callout } from '#lib/docs';
</script>

# Middleware

Write ordinary Markdown here.

```rust title="Example"
use framework::prelude::*;
```

<Callout type="info">Code blocks are always highlighted.</Callout>
````

When a prepared artifact is available, the build annotates resolvable framework identifiers in Rust fences automatically. No wrapper component is required.

Fence options:

| Meta | Effect |
| --- | --- |
| `title="..."` | Caption above the block |
| `filename=...` | Monospace caption |
| `{3-5}`, `{1,4}` | Highlight lines |
| `plain` | Skip symbol annotation |

Components available from `#lib/docs`: `Badge`, `Callout`, `PackageInstall`, `Steps`, `Tabs`, and `Example`.

## Handwritten API pages

To give a framework symbol deeper prose documentation, create an `.svx` page under `src/content/symbols`. Its visible location is its Rust path:

```text
src/content/symbols/1/upwell_macros/component.svx  ->  upwell_macros::component
```

Version directory selectors and frontmatter `since`/`until` ranges use public `releaseVersion`. A full selector is selected at its lower boundary and remains selected until a later candidate at the same normalized path replaces it; major and minor selectors match only their stable major or minor ranges. The selected file's `until` or `versions` range decides when it stops being visible; the resolver never falls back to an earlier candidate. Legacy `@<SemVer>` directories and paths with multiple selectors are rejected. Artifact cache directories use the public release, while `manifest.documentation.sourcePackageVersion` preserves the Cargo source provenance.

Use `SymbolMeta`, `SymbolSignature`, `SymbolMembers`, and `SymbolImpls` inside those pages to render facts from the prepared artifact. A symbol page is optional: symbols without one still show hover cards in code blocks.

## Commands

| Command | Does |
| --- | --- |
| `bun run dev` | Start the development server |
| `bun run build` | Build and prerender the documentation site |
| `bun run check` | Type-check Svelte and `.svx` pages |
| `bun run lint` | Run eslint |
| `bun run test:unit` | Run unit tests |
| `bun run test:e2e` | Run Playwright tests |
| `bun run docs:prepare` | Generate the optional Rustdoc artifact |
