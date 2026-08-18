# Rust documentation template

A generic, ready-to-use documentation site for a Rust framework. Authors write `.svx` files; the optional `docs:prepare` command builds a Rustdoc-derived artifact that enriches Rust snippets with symbols, signatures, summaries, feature requirements, source links, and search results.

## Start writing

```sh
bun install
bun run dev
```

The site is immediately usable without a Rust framework checkout. One version directory selector gates a content candidate without appearing in URLs, navigation, breadcrumbs, search paths, or Rust symbol paths. `1` matches stable `>=1.0.0, <2.0.0`; `1.4` matches stable `>=1.4.0, <1.5.0`; full selectors such as `1.4.0` and `1.4.0-rc.1` replace a candidate at their lower bound and carry forward. For example, `src/content/docs/1/framework/application-model.svx` serves `/docs/1.0.0/framework/application-model`; the selector may appear at any directory depth. Partial prereleases, build metadata, legacy `@` directories, and paths with multiple selectors are rejected. Shared unversioned files are the baseline. A path-selected candidate must not also declare frontmatter `since`.

Before publishing, update the placeholder values in `src/lib/docs/config.ts`:

- `framework.root`: the facade repository and its independently versioned releases
- `framework.crates`: external repositories, each with its own releases and latest version
- `framework.*.crate`: the repository's root Cargo package; workspace members are inferred
- `framework.*.repository`: the repository URL used by the header and source links
- `framework.*.versions`: explicit public releases for that repository
- `framework.*.latest`: the repository-specific latest release
- `topics`: optional sidebar filters and the framework crates they classify
- `rustdoc.directDependencyCrates`: external crates considered plausible imports in ambiguous snippets; use `workspace` or an explicit list
- `rustdoc.standardLibraryCrates`: first-tier external crates to enrich from `rust-docs-json`

## Optional Rustdoc enrichment

Prepare an artifact from a local checkout when you want framework-aware code examples and API search:

```sh
bun run docs:prepare --local ../framework
```

`docs:prepare --version <release>` runs nightly rustdoc JSON over the workspace and writes the resulting artifact to `artifacts/upwell-docs/<source>/<release>/`. These compact artifacts are committed with the documentation site, making Railpack builds deterministic without cloning Rust repositories or running rustdoc. The manifest records the exact Git commit, whether that commit has a tag, and every vendored repository snapshot. Untagged prereleases therefore work without special deployment behavior: prepare from the intended commit and commit the resulting artifact. Releases listed in `docsConfig.readOnlyArtifactVersions` cannot be regenerated accidentally.

Additional repository checkouts can contribute vendored rustdoc snapshots:

```sh
bun run docs:prepare --local ../upwell --external ../upwell-axum
```

Do not hand-edit files under `artifacts/upwell-docs`. Regenerate the owning source release, inspect the manifest and diff, then commit the complete artifact directory.

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

### Group entrypoints and ordering

`order` sorts groups and pages against each other in one list, so a group can sit anywhere — above the root pages, between them, or last.

A directory's `index.svx` is that group's entrypoint. Its `/index` segment is dropped from the URL, so `1/cargo-upwell/index.svx` serves `/docs/1.0.0/cargo-upwell`, and in navigation it *becomes* the group rather than appearing as a leaf beside its own siblings: the group takes the page's title as its label, links to it, and is ordered by its `order`. A group without an `index.svx` inherits the order of its earliest child.

```text
src/content/docs/1/getting-started.svx        order: 1     ->  first entry
src/content/docs/1/cargo-upwell/index.svx     order: 150   ->  the group, placed last
src/content/docs/1/cargo-upwell/inspect.svx   order: 20    ->  a child, ordered within the group
```

A child's `order` only ranks it against its siblings, so a group can be moved without renumbering its contents.

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

## What machines read

The site publishes what a crawler or a language model needs, because following links no longer finds it: the reference tree renders only expanded groups and the symbol index renders only the rows in view.

| File | Contains |
| --- | --- |
| `/robots.txt` | Crawl policy, and the sitemap's absolute URL |
| `/sitemap.xml` | Every canonical page of every release — guides, symbol index, symbol pages. Redirects and the repository browser are left out |
| `/llms.txt` | A short index with a sentence per guide, each linking its Markdown copy |
| `/llms/<release>/<slug>.md` | One guide as Markdown: prose, headings and code blocks, without the Svelte layer |

The sitemap is generated by [super-sitemap](https://github.com/jasongitmail/super-sitemap), which derives the route list from the routes on disk and fails the build while a parameterized route has neither values nor an exclusion — so a new route family cannot go unlisted in silence.

These files carry absolute URLs and are prerendered, so the origin is a build input:

```sh
SITE_ORIGIN=https://docs.example.com bun run build
```

A bare host is accepted too, which is what a hosting platform gives you — on Railway, `SITE_ORIGIN=${{RAILWAY_PUBLIC_DOMAIN}}` — and is read as `https`. Unset, it falls back to `http://localhost:3000`, which is what a local build should say. Every variable the site reads is declared in `src/env.ts` with its default and whether it is read at build time or at startup.

## Commands

| Command | Does |
| --- | --- |
| `bun run dev` | Start the development server |
| `bun run build` | Build and prerender the documentation site |
| `bun run check` | Type-check Svelte and `.svx` pages |
| `bun run lint` | Run eslint |
| `bun run test:unit` | Run unit tests |
| `bun run test:e2e` | Run Playwright tests, including the source viewer against a local fixture repository |
| `bun run docs:prepare` | Generate a source-scoped Rustdoc artifact for review and commit |

## Railway

The committed `railpack.json` uses Railpack's Node application provider and starts the adapter-node output with Bun. Bun is pinned by `packageManager` in `package.json`, so install, build, and runtime use the same JavaScript runtime. Railway only needs to run the normal install and `bun run build`; Rust, Cargo, Git checkouts, release discovery, and artifact downloads are not part of deployment.
