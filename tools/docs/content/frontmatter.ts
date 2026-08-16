/**
 * Reads a page's frontmatter without compiling the page.
 *
 * The site knows every page's metadata on every route — the sidebar lists them all — but a page's
 * *markup* is only needed for the one being read. Those two facts pull in opposite directions when
 * metadata is an export of the compiled module: importing it drags the markup along, which is why
 * `import.meta.glob` had to be eager and why every page's compiled output ended up in one chunk.
 *
 * Parsing the frontmatter straight from the file breaks that link. It is the same text mdsvex reads,
 * read earlier, so navigation can be built from metadata alone and the components can be code-split.
 *
 * Deliberately not a YAML implementation. The frontmatter schema is small and closed — strings,
 * numbers, booleans and string lists, no nesting — and every field is declared in `types.ts`. A real
 * YAML parser would be a dependency and a much larger surface for a format the site fully controls;
 * anything this cannot read is a build error rather than a silent misreading.
 */

/** A frontmatter block that cannot be read. */
export class FrontmatterError extends Error {
	constructor(file: string, message: string) {
		super(`${message}\n\n  Page: ${file}\n`);

		this.name = 'FrontmatterError';
	}
}

/** The delimiter mdsvex uses. */
const FENCE = /^---\r?\n([\s\S]*?)\r?\n---/;

/** A scalar frontmatter value. */
type Scalar = string | number | boolean;

export type FrontmatterValue = Scalar | Scalar[];

/**
 * Parses the frontmatter block of a page's source.
 *
 * Returns an empty object for a page with no frontmatter, which is legal for a symbol page — its
 * title defaults to the symbol name.
 */
export function parseFrontmatter(source: string, file: string): Record<string, FrontmatterValue> {
	const fenced = FENCE.exec(source.trimStart());

	if (!fenced) {
		return {};
	}

	const fields: Record<string, FrontmatterValue> = {};
	const lines = fenced[1].split(/\r?\n/);
	let at = 0;

	while (at < lines.length) {
		const line = lines[at];

		if (line.trim() === '' || line.trimStart().startsWith('#')) {
			at += 1;

			continue;
		}

		const separator = line.indexOf(':');

		if (separator === -1) {
			throw new FrontmatterError(file, `Frontmatter line is not a "key: value" pair: ${line.trim()}`);
		}

		const key = line.slice(0, separator).trim();
		const inline = line.slice(separator + 1).trim();

		// A key with nothing after the colon introduces a block list, whose items are the indented
		// `- item` lines that follow. That is the only multi-line form the schema has.
		if (inline === '') {
			const items: Scalar[] = [];

			at += 1;

			while (at < lines.length && /^\s*-\s/.test(lines[at])) {
				items.push(scalar(lines[at].trim().slice(1).trim()));
				at += 1;
			}

			fields[key] = items;

			continue;
		}

		fields[key] = inline.startsWith('[') ? inlineList(inline, file) : scalar(inline);
		at += 1;
	}

	return fields;
}

/** `[a, 'b', c]` — the flow form of a list. */
function inlineList(value: string, file: string): Scalar[] {
	if (!value.endsWith(']')) {
		throw new FrontmatterError(file, `Frontmatter list is not closed: ${value}`);
	}

	const inner = value.slice(1, -1).trim();

	if (inner === '') {
		return [];
	}

	return inner.split(',').map((entry) => scalar(entry.trim()));
}

/**
 * Reads one scalar, unquoting and coercing the way YAML would for this schema.
 *
 * Only the coercions the schema actually needs: `order` is a number, `draft` is a boolean, and
 * everything else is a string. A quoted value is always a string, which is what lets a title be
 * `'0.21'` without becoming a number.
 */
function scalar(raw: string): Scalar {
	const quoted = /^(['"])([\s\S]*)\1$/.exec(raw);

	if (quoted) {
		return quoted[2];
	}

	if (raw === 'true' || raw === 'false') {
		return raw === 'true';
	}

	if (raw !== '' && Number.isFinite(Number(raw))) {
		return Number(raw);
	}

	return raw;
}
