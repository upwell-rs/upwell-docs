/**
 * A repository, served the way GitHub serves one.
 *
 * The source viewer's fetches are the *server's*, not the browser's, so nothing a Playwright page can
 * intercept ever reaches them. Pointing the two origins it reads from at this process is what makes
 * the viewer testable at all: the same code paths run, against a repository the suite owns, with no
 * rate limit, no network, and content chosen to exercise the parts that broke before —
 * a filename needing URL encoding, a README with relative links, and enough files that a windowed
 * tree is the only way to render them.
 *
 * Two endpoints, matching the two GitHub origins:
 *   GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1   the inventory
 *   GET /{owner}/{repo}/{sha}/{path}                        one file's contents
 */

const PORT = Number(process.env.SOURCE_FIXTURE_PORT ?? 5199);

const README = `# Example crate

A fixture repository. See [the guide](docs/guide.md) and [the manifest](../Cargo.toml).

## Usage

Read [usage](#usage) or the [logo](assets/logo.png).
`;

const LIB = `use upwell::prelude::*;

/// A component the fixture declares.
#[component]
pub struct Greeter;

impl Greeter {
    pub fn greet(&self, who: &str) -> String {
        format!("Hello, {who}!")
    }
}
`;

/** The fixture's own files, plus enough generated ones that the tree has to be windowed. */
const files = new Map<string, string>([
	['README.md', README],
	['Cargo.toml', '[package]\nname = "fixture"\nversion = "0.1.0"\n'],
	['crates/app/src/lib.rs', LIB],
	['crates/app/README.md', '# app\n\nThe app crate.\n'],
	['docs/guide.md', '# Guide\n\nA linked document.\n'],
	// A valid Git filename that is not a valid URL path segment: the viewer has to encode it.
	['crates/app/src/odd#name.rs', 'pub const ODD: bool = true;\n'],
	...Array.from({ length: 1_200 }, (_, index): [string, string] => [
		`crates/generated/src/module${index}.rs`,
		`pub const INDEX: usize = ${index};\n`
	])
]);

function tree(): string {
	return JSON.stringify({
		truncated: false,
		tree: [...files].map(([path, contents]) => ({ path, type: 'blob', size: contents.length }))
	});
}

const server = Bun.serve({
	port: PORT,
	fetch(request) {
		const url = new URL(request.url);
		const segments = url.pathname.slice(1).split('/').map(decodeURIComponent);

		if (segments[0] === 'repos' && segments[3] === 'git' && segments[4] === 'trees') {
			return new Response(tree(), { headers: { 'content-type': 'application/json' } });
		}

		// Raw contents: /{owner}/{repo}/{sha}/{path…}
		const contents = files.get(segments.slice(3).join('/'));

		return contents === undefined
			? new Response('not found', { status: 404 })
			: new Response(contents, { headers: { 'content-type': 'text/plain' } });
	}
});

console.log(`source fixture listening on http://localhost:${server.port}`);
