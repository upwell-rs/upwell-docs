# Rust documentation template

A generic, ready-to-use documentation site for a Rust framework. Authors write `.svx` files; the optional `docs:prepare` command builds a Rustdoc-derived artifact that enriches Rust snippets with symbols, signatures, summaries, feature requirements, source links, and search results.

## Start writing

```sh
bun install
bun run dev
```

The site is immediately usable without a Rust framework checkout. Replace the starter page at `src/content/docs/getting-started.svx`, then add more `.svx` pages under `src/content/docs`. A file's path becomes its URL.

Before publishing, update the placeholder values in `src/lib/docs/config.ts`:

- `framework.crate`: the public facade crate, or the crate users import most often
- `framework.name`: the display name shown in the header
- `framework.repository`: the repository URL used by the header and source links
- `framework.releaseTag`: the tag convention for your releases
- `versions`: the framework version the site currently documents
- `topics`: optional sidebar filters and the framework crates they classify
- `rustdoc.directDependencyCrates`: external crates considered plausible imports in ambiguous snippets; use `workspace` or an explicit list
- `rustdoc.standardLibraryCrates`: first-tier external crates to enrich from `rust-docs-json`

## Optional Rustdoc enrichment

Prepare an artifact from a local checkout when you want framework-aware code examples and API search:

```sh
bun run docs:prepare --local ../framework
```

`docs:prepare` runs nightly rustdoc JSON over the workspace and writes the resulting artifact to `.cache/framework-docs/<version>/`. The documentation site remains fully usable without it; Rust fences are highlighted but have no API annotations.

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

Every guide is an `.svx` file under `src/content/docs`:

````svx
---
title: Middleware
description: Wrap requests with cross-cutting behavior.
section: Guides
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

To give a framework symbol deeper prose documentation, create an `.svx` page under `src/content/symbols`. Its location is its Rust path:

```text
src/content/symbols/framework/prelude/component.svx  ->  framework::prelude::component
```

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
