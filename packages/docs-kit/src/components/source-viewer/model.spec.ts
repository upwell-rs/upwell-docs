import { describe, expect, it } from 'vitest';

import { directSourceChildren, sourceBreadcrumbs, sourceTreeRows, tokenizeSource } from './model.ts';

const paths = ['Cargo.toml', 'crates/app/Cargo.toml', 'crates/app/src/lib.rs', 'crates/core/src/lib.rs'];

describe('sourceTreeRows', () => {
	it('opens only the active ancestry by default', () => {
		expect(sourceTreeRows(paths, 'crates/app/src/lib.rs', '', new Set()).map((row) => row.path)).toEqual([
			'crates',
			'crates/app',
			'crates/app/src',
			'crates/app/src/lib.rs',
			'crates/app/Cargo.toml',
			'crates/core',
			'Cargo.toml'
		]);
	});

	it('shows matching files and their ancestors while filtering', () => {
		expect(sourceTreeRows(paths, '', 'core', new Set()).map((row) => row.path)).toEqual([
			'crates', 'crates/core', 'crates/core/src', 'crates/core/src/lib.rs'
		]);
	});
});

describe('source path models', () => {
	it('resolves every segment of a qualified symbol path', () => {
		const module = { name: 'upwell_build', lens: 'module', reachablePaths: ['upwell_build'] } as never;
		const callable = { name: 'configure', lens: 'callable', reachablePaths: ['upwell_build::configure'] } as never;
		const tokens = tokenizeSource('upwell_build::configure();', [module, callable], { file: 'build.rs', line: 1 });

		expect(tokens.filter((token) => token.target).map((token) => [token.text, token.kind])).toEqual([
			['upwell_build', 'module'],
			['configure', 'callable']
		]);
	});

	it('does not link a derive to an unrelated same-name value', () => {
		const variant = { name: 'Deserialize', kind: 'variant', lens: 'value', procMacro: null, reachablePaths: ['error::Deserialize'], path: 'src/error.rs', line: 4 } as never;
		const tokens = tokenizeSource('#[derive(Deserialize)]', [variant], { file: 'src/lib.rs', line: 1 });

		expect(tokens.find((token) => token.text === 'Deserialize')?.target).toBeUndefined();
	});

	it('links derive syntax only to a documented derive macro', () => {
		const derive = { name: 'Component', kind: 'proc_macro', lens: 'macro', procMacro: 'derive', reachablePaths: ['upwell_macros::Component'], path: 'crates/macros/src/lib.rs', line: 8 } as never;
		const tokens = tokenizeSource('#[derive(Component)]', [derive], { file: 'src/lib.rs', line: 1 });

		expect(tokens.find((token) => token.text === 'Component')?.target).toBe(derive);
	});

	it('uses imported prelude scope to disambiguate same-name attribute macros', () => {
		const axum = { name: 'handlers', kind: 'proc_macro', lens: 'macro', procMacro: 'attribute', reachablePaths: ['upwell::axum::prelude::handlers'], path: 'crates/axum-macros/src/lib.rs', line: 1 } as never;
		const rpc = { name: 'handlers', kind: 'proc_macro', lens: 'macro', procMacro: 'attribute', reachablePaths: ['upwell::daemon::prelude::handlers'], path: 'crates/rpc-macros/src/lib.rs', line: 1 } as never;
		const tokens = tokenizeSource('#[handlers]', [axum, rpc], { file: 'examples/http/src/greet.rs', line: 1, imports: ['upwell::axum::prelude::*'] });

		expect(tokens.find((token) => token.text === 'handlers')?.target).toBe(axum);
	});

	it('selects an attribute macro before applying import scope across namespaces', () => {
		const module = { name: 'config', kind: 'module', lens: 'module', procMacro: null, reachablePaths: ['upwell::prelude::config'], path: 'src/lib.rs', line: 225 } as never;
		const attribute = { name: 'config', kind: 'proc_macro', lens: 'macro', procMacro: 'attribute', reachablePaths: ['upwell_macros::config'], path: 'crates/macros/src/lib.rs', line: 166 } as never;
		const tokens = tokenizeSource('#[config(path = "example")]', [module, attribute], {
			file: 'examples/http/src/greet.rs',
			line: 12,
			imports: ['upwell::prelude::*']
		});

		expect(tokens.find((token) => token.text === 'config')?.target).toBe(attribute);
	});

	it('keeps declaration and use styling consistent for functions', () => {
		const path = 'crates/upwell-build/src/lib.rs';
		const line = 31;
		const callable = { name: 'configure', kind: 'function', lens: 'callable', procMacro: null, reachablePaths: ['upwell_build::configure'], path, line } as never;
		const declaration = tokenizeSource('pub fn configure() {}', [callable], { file: path, line });

		expect(declaration.find((token) => token.text === 'configure')?.kind).toBe('callable');
	});

	it('filters declaration candidates by the written item kind', () => {
		const structure = { name: 'Test', kind: 'struct', lens: 'type', path: 'src/lib.rs', line: 1, reachablePaths: ['crate::Test'] } as never;
		const enumeration = { name: 'Test', kind: 'enum', lens: 'type', path: 'src/lib.rs', line: 1, reachablePaths: ['other::Test'] } as never;
		const tokens = tokenizeSource('struct Test;', [structure, enumeration], { file: 'src/lib.rs', line: 1 });

		expect(tokens.find((token) => token.text === 'Test')?.target).toBe(structure);
	});

	it('keeps a procedural macro semantic kind at its fn declaration', () => {
		const macro = { name: 'config', kind: 'proc_macro', lens: 'macro', procMacro: 'attribute', path: 'src/lib.rs', line: 2, reachablePaths: ['crate::config'] } as never;
		const tokens = tokenizeSource('pub fn config() {}', [macro], { file: 'src/lib.rs', line: 2 });

		expect(tokens.find((token) => token.text === 'config')?.target).toBe(macro);
	});

	it('builds clickable breadcrumb ancestry', () => {
		expect(sourceBreadcrumbs('crates/app/src/lib.rs')).toEqual([
			{ name: 'crates', path: 'crates', current: false },
			{ name: 'app', path: 'crates/app', current: false },
			{ name: 'src', path: 'crates/app/src', current: false },
			{ name: 'lib.rs', path: 'crates/app/src/lib.rs', current: true }
		]);
	});

	it('lists direct directory children only', () => {
		expect(directSourceChildren(paths.map((path) => ({ path, bytes: 1 })), 'crates').map((row) => row.path)).toEqual([
			'crates/app', 'crates/core'
		]);
	});
});
