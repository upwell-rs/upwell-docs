/** Reads a page's frontmatter without compiling the page. */

/** A frontmatter block that cannot be read. */
export class FrontmatterError extends Error {
	constructor(file: string, message: string) {
		super(`${message}\n\n  Page: ${file}\n`);

		this.name = 'FrontmatterError';
	}
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---/;

type Scalar = string | number | boolean;

export type FrontmatterValue = Scalar | Scalar[];

/** Parses the small, closed frontmatter schema used by documentation pages. */
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
