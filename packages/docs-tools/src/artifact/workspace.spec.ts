import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { readGit } from './workspace.ts';

const run = promisify(execFile);
let checkout: string | undefined;

afterEach(async () => {
	if (checkout) await rm(checkout, { recursive: true, force: true });
	checkout = undefined;
});

describe('readGit', () => {
	it('records no tag as null rather than an empty string', async () => {
		checkout = await mkdtemp(path.join(tmpdir(), 'docs-git-'));
		await run('git', ['init', '-q'], { cwd: checkout });
		await run('git', ['config', 'user.email', 'docs@example.test'], { cwd: checkout });
		await run('git', ['config', 'user.name', 'Docs Test'], { cwd: checkout });
		await run('git', ['commit', '--allow-empty', '-qm', 'initial'], { cwd: checkout });

		expect((await readGit(checkout, '')).tag).toBeNull();
	});
});
